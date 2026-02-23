/**
 * Upload Routes - File upload for custom deployments
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');
const config = require('../config');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(config.paths.buildsDir, 'uploads', req.user.id);
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow common project files
        const allowedExtensions = [
            '.zip', '.tar', '.tar.gz', '.tgz',
            '.js', '.ts', '.jsx', '.tsx',
            '.py', '.php', '.rb', '.go',
            '.json', '.yaml', '.yml',
            '.dockerfile', '.md', '.txt',
            '.html', '.css', '.scss',
        ];

        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext) || file.originalname.toLowerCase() === 'dockerfile') {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not allowed`));
        }
    },
});

// All upload routes require authentication
router.use(authenticate);

/**
 * POST /api/uploads/project
 * Upload a project archive (zip/tar)
 */
router.post('/project', upload.single('project'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new APIError('No file uploaded', 400);
    }

    const uploadId = uuidv4();
    const filePath = req.file.path;
    const fileSize = req.file.size;

    logger.info(`Project uploaded: ${filePath} (${fileSize} bytes)`);

    res.json({
        message: 'Project uploaded successfully',
        upload: {
            id: uploadId,
            filename: req.file.originalname,
            path: filePath,
            size: fileSize,
        },
    });
}));

/**
 * POST /api/uploads/dockerfile
 * Upload a custom Dockerfile
 */
router.post('/dockerfile', upload.single('dockerfile'), asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new APIError('No Dockerfile uploaded', 400);
    }

    const filePath = req.file.path;

    // Read and validate Dockerfile
    const content = await fs.readFile(filePath, 'utf8');

    if (!content.includes('FROM')) {
        throw new APIError('Invalid Dockerfile: missing FROM instruction', 400);
    }

    logger.info(`Dockerfile uploaded: ${filePath}`);

    res.json({
        message: 'Dockerfile uploaded successfully',
        dockerfile: {
            path: filePath,
            size: req.file.size,
        },
    });
}));

/**
 * POST /api/uploads/build-custom
 * Build a custom Docker image from uploaded files
 */
router.post('/build-custom', [
    body('websiteId').isUUID(),
    body('dockerfilePath').optional().isString(),
    body('contextPath').optional().isString(),
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400);
    }

    const { websiteId, dockerfilePath, contextPath } = req.body;

    // Verify website ownership
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [websiteId, req.user.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const buildContext = contextPath || path.join(config.paths.buildsDir, 'uploads', req.user.id);

    // Build Docker image
    const Docker = require('dockerode');
    const docker = new Docker();

    const imageName = `uwbp-custom/${website.subdomain}:${Date.now()}`;

    try {
        // Build the image
        const stream = await docker.buildImage({
            context: buildContext,
            src: [dockerfilePath ? path.basename(dockerfilePath) : 'Dockerfile'],
        }, {
            t: imageName,
            dockerfile: dockerfilePath ? path.basename(dockerfilePath) : 'Dockerfile',
        });

        // Wait for build to complete
        await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            }, (event) => {
                logger.debug(`Build progress: ${JSON.stringify(event)}`);
            });
        });

        // Update website with custom image
        await db.query(
            'UPDATE websites SET container_image = $1, status = $2 WHERE id = $3',
            [imageName, 'pending', websiteId]
        );

        logger.info(`Custom image built: ${imageName}`);

        res.json({
            message: 'Custom image built successfully',
            image: imageName,
        });
    } catch (error) {
        logger.error(`Build failed: ${error.message}`);
        throw new APIError(`Build failed: ${error.message}`, 500);
    }
}));

/**
 * GET /api/uploads/templates
 * Get available templates with their configurations
 */
router.get('/templates', asyncHandler(async (req, res) => {
    const templates = [
        {
            id: 'static',
            name: 'Static Website',
            description: 'Simple HTML/CSS/JS website served by Nginx',
            defaultPort: 80,
            icon: 'globe',
        },
        {
            id: 'nodejs',
            name: 'Node.js Application',
            description: 'Node.js application with Express, Fastify, or any framework',
            defaultPort: 3000,
            icon: 'server',
        },
        {
            id: 'nextjs',
            name: 'Next.js',
            description: 'React framework with SSR and static generation',
            defaultPort: 3000,
            icon: 'layers',
        },
        {
            id: 'react',
            name: 'React SPA',
            description: 'Single Page Application with React',
            defaultPort: 3000,
            icon: 'code',
        },
        {
            id: 'vue',
            name: 'Vue.js',
            description: 'Vue.js application with Vue Router and Vuex',
            defaultPort: 3000,
            icon: 'layers',
        },
        {
            id: 'python',
            name: 'Python Application',
            description: 'Python web app with Flask, Django, or FastAPI',
            defaultPort: 8000,
            icon: 'terminal',
        },
        {
            id: 'php',
            name: 'PHP Application',
            description: 'PHP application with Apache',
            defaultPort: 80,
            icon: 'code',
        },
        {
            id: 'custom',
            name: 'Custom Docker',
            description: 'Bring your own Dockerfile for complete control',
            defaultPort: 3000,
            icon: 'box',
        },
    ];

    res.json({ templates });
}));

/**
 * GET /api/uploads/:websiteId/files
 * List files for a website
 */
router.get('/:websiteId/files', asyncHandler(async (req, res) => {
    const { websiteId } = req.params;

    // Verify website ownership
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [websiteId, req.user.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const websiteDir = path.join(config.paths.buildsDir, 'websites', website.subdomain);

    try {
        await fs.access(websiteDir);
    } catch {
        // Directory doesn't exist yet
        return res.json({ files: [] });
    }

    const files = [];
    const entries = await fs.readdir(websiteDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isFile()) {
            const stats = await fs.stat(path.join(websiteDir, entry.name));
            files.push({
                name: entry.name,
                size: formatBytes(stats.size),
                modified: stats.mtime
            });
        }
    }

    res.json({ files });
}));

/**
 * GET /api/uploads/:websiteId/files/:filename
 * Get file content
 */
router.get('/:websiteId/files/:filename', asyncHandler(async (req, res) => {
    const { websiteId, filename } = req.params;

    // Verify website ownership
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [websiteId, req.user.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const filePath = path.join(config.paths.buildsDir, 'websites', website.subdomain, filename);

    // Security check - prevent path traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.join(config.paths.buildsDir, 'websites', website.subdomain))) {
        throw new APIError('Invalid file path', 400);
    }

    try {
        const content = await fs.readFile(filePath, 'utf8');
        res.json({ content, filename });
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new APIError('File not found', 404);
        }
        throw error;
    }
}));

/**
 * PUT /api/uploads/:websiteId/files/:filename
 * Update file content
 */
router.put('/:websiteId/files/:filename', asyncHandler(async (req, res) => {
    const { websiteId, filename } = req.params;
    const { content } = req.body;

    if (content === undefined) {
        throw new APIError('Content is required', 400);
    }

    // Verify website ownership
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [websiteId, req.user.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const websiteDir = path.join(config.paths.buildsDir, 'websites', website.subdomain);
    const filePath = path.join(websiteDir, filename);

    // Security check - prevent path traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(websiteDir)) {
        throw new APIError('Invalid file path', 400);
    }

    // Ensure directory exists
    await fs.mkdir(websiteDir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, content, 'utf8');

    logger.info(`File updated: ${filePath}`);

    res.json({ message: 'File saved successfully', filename });
}));

/**
 * DELETE /api/uploads/:websiteId/files/:filename
 * Delete a file
 */
router.delete('/:websiteId/files/:filename', asyncHandler(async (req, res) => {
    const { websiteId, filename } = req.params;

    // Verify website ownership
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [websiteId, req.user.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const filePath = path.join(config.paths.buildsDir, 'websites', website.subdomain, filename);

    // Security check - prevent path traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.join(config.paths.buildsDir, 'websites', website.subdomain))) {
        throw new APIError('Invalid file path', 400);
    }

    try {
        await fs.unlink(filePath);
        logger.info(`File deleted: ${filePath}`);
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new APIError('File not found', 404);
        }
        throw error;
    }
}));

/**
 * POST /api/uploads/:websiteId/files
 * Upload files to a website
 */
router.post('/:websiteId/files', upload.array('files', 20), asyncHandler(async (req, res) => {
    const { websiteId } = req.params;

    if (!req.files || req.files.length === 0) {
        throw new APIError('No files uploaded', 400);
    }

    // Verify website ownership
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
        [websiteId, req.user.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const websiteDir = path.join(config.paths.buildsDir, 'websites', website.subdomain);

    // Ensure directory exists
    await fs.mkdir(websiteDir, { recursive: true });

    // Move uploaded files to website directory
    const uploadedFiles = [];
    for (const file of req.files) {
        const destPath = path.join(websiteDir, file.originalname);
        await fs.rename(file.path, destPath);
        uploadedFiles.push({
            name: file.originalname,
            size: formatBytes(file.size)
        });
    }

    logger.info(`Files uploaded to website ${website.subdomain}: ${uploadedFiles.map(f => f.name).join(', ')}`);

    res.json({
        message: 'Files uploaded successfully',
        files: uploadedFiles
    });
}));

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
