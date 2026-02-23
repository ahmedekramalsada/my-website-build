/**
 * Permission Middleware
 * Handles role-based access control and permission checking
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Cache for user permissions (simple in-memory cache)
 * In production, use Redis for distributed caching
 */
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all permissions for a user from database
 * @param {string} userId - User ID
 * @returns {Promise<string[]>} Array of permission names
 */
async function getUserPermissions(userId) {
    // Check cache first
    const cached = permissionCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.permissions;
    }

    try {
        const result = await db.query(
            `SELECT DISTINCT p.name
             FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS perm_text
             JOIN permissions p ON p.name = perm_text
             WHERE ur.user_id = $1`,
            [userId]
        );

        const permissions = result.rows.map(row => row.name);

        // Also check for wildcard permission
        const wildcardResult = await db.query(
            `SELECT EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = $1 AND r.permissions ? '*'
            ) as has_wildcard`,
            [userId]
        );

        if (wildcardResult.rows[0]?.has_wildcard) {
            permissions.push('*');
        }

        // Cache the result
        permissionCache.set(userId, {
            permissions,
            timestamp: Date.now()
        });

        return permissions;
    } catch (error) {
        logger.error('Error fetching user permissions:', error);
        return [];
    }
}

/**
 * Check if user has a specific permission
 * @param {string} userId - User ID
 * @param {string} permission - Permission name
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, permission) {
    const permissions = await getUserPermissions(userId);
    return permissions.includes(permission) || permissions.includes('*');
}

/**
 * Check if user has any of the specified permissions
 * @param {string} userId - User ID
 * @param {string[]} permissionList - Array of permission names
 * @returns {Promise<boolean>}
 */
async function hasAnyPermission(userId, permissionList) {
    const permissions = await getUserPermissions(userId);
    if (permissions.includes('*')) return true;
    return permissionList.some(p => permissions.includes(p));
}

/**
 * Check if user has all of the specified permissions
 * @param {string} userId - User ID
 * @param {string[]} permissionList - Array of permission names
 * @returns {Promise<boolean>}
 */
async function hasAllPermissions(userId, permissionList) {
    const permissions = await getUserPermissions(userId);
    if (permissions.includes('*')) return true;
    return permissionList.every(p => permissions.includes(p));
}

/**
 * Middleware to require a specific permission
 * @param {string} permission - Required permission name
 */
const requirePermission = (permission) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Authentication required'
            });
        }

        try {
            const hasAccess = await hasPermission(req.user.id, permission);

            if (!hasAccess) {
                logger.warn(`Permission denied: User ${req.user.id} lacks permission '${permission}'`);
                return res.status(403).json({
                    error: 'FORBIDDEN',
                    message: 'You do not have permission to perform this action',
                    requiredPermission: permission
                });
            }

            next();
        } catch (error) {
            logger.error('Permission check error:', error);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to check permissions'
            });
        }
    };
};

/**
 * Middleware to require any of the specified permissions
 * @param {string[]} permissions - Array of permission names
 */
const requireAnyPermission = (permissions) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Authentication required'
            });
        }

        try {
            const hasAccess = await hasAnyPermission(req.user.id, permissions);

            if (!hasAccess) {
                logger.warn(`Permission denied: User ${req.user.id} lacks any of permissions: ${permissions.join(', ')}`);
                return res.status(403).json({
                    error: 'FORBIDDEN',
                    message: 'You do not have permission to perform this action',
                    requiredPermissions: permissions
                });
            }

            next();
        } catch (error) {
            logger.error('Permission check error:', error);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to check permissions'
            });
        }
    };
};

/**
 * Middleware to require all of the specified permissions
 * @param {string[]} permissions - Array of permission names
 */
const requireAllPermissions = (permissions) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Authentication required'
            });
        }

        try {
            const hasAccess = await hasAllPermissions(req.user.id, permissions);

            if (!hasAccess) {
                logger.warn(`Permission denied: User ${req.user.id} lacks all permissions: ${permissions.join(', ')}`);
                return res.status(403).json({
                    error: 'FORBIDDEN',
                    message: 'You do not have all required permissions',
                    requiredPermissions: permissions
                });
            }

            next();
        } catch (error) {
            logger.error('Permission check error:', error);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to check permissions'
            });
        }
    };
};

/**
 * Middleware to check ownership or admin permission
 * Allows access if user owns the resource or has admin permission
 * @param {string} permission - Admin permission to check
 * @param {Function} getResourceOwnerId - Function to extract owner ID from request
 */
const requireOwnershipOrPermission = (permission, getResourceOwnerId) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Authentication required'
            });
        }

        try {
            // Check if user has the admin permission
            const hasAdminAccess = await hasPermission(req.user.id, permission);
            if (hasAdminAccess) {
                return next();
            }

            // Check ownership
            const ownerId = await getResourceOwnerId(req);
            if (ownerId && ownerId === req.user.id) {
                return next();
            }

            logger.warn(`Access denied: User ${req.user.id} is not owner and lacks permission '${permission}'`);
            return res.status(403).json({
                error: 'FORBIDDEN',
                message: 'You do not have permission to access this resource'
            });
        } catch (error) {
            logger.error('Permission check error:', error);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to check permissions'
            });
        }
    };
};

/**
 * Clear permission cache for a user
 * @param {string} userId - User ID
 */
function clearUserPermissionCache(userId) {
    permissionCache.delete(userId);
}

/**
 * Clear all permission cache
 */
function clearAllPermissionCache() {
    permissionCache.clear();
}

/**
 * Get user's roles from database
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of role objects
 */
async function getUserRoles(userId) {
    try {
        const result = await db.query(
            `SELECT r.id, r.name, r.display_name, r.is_system, ur.assigned_at
             FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE ur.user_id = $1
             ORDER BY r.name`,
            [userId]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error fetching user roles:', error);
        return [];
    }
}

/**
 * Assign role to user
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 * @param {string} assignedBy - ID of user assigning the role
 */
async function assignRoleToUser(userId, roleId, assignedBy) {
    try {
        await db.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [userId, roleId, assignedBy]
        );

        // Clear cache
        clearUserPermissionCache(userId);

        logger.info(`Role ${roleId} assigned to user ${userId} by ${assignedBy}`);
    } catch (error) {
        logger.error('Error assigning role:', error);
        throw error;
    }
}

/**
 * Remove role from user
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 */
async function removeRoleFromUser(userId, roleId) {
    try {
        await db.query(
            `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
            [userId, roleId]
        );

        // Clear cache
        clearUserPermissionCache(userId);

        logger.info(`Role ${roleId} removed from user ${userId}`);
    } catch (error) {
        logger.error('Error removing role:', error);
        throw error;
    }
}

module.exports = {
    getUserPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions,
    requireOwnershipOrPermission,
    clearUserPermissionCache,
    clearAllPermissionCache,
    getUserRoles,
    assignRoleToUser,
    removeRoleFromUser
};