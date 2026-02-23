import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileCode, FileArchive, X, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const UploadProject = () => {
    const { token } = useAuthStore();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const dockerfileInputRef = useRef(null);

    const [uploadType, setUploadType] = useState('archive'); // 'archive' or 'dockerfile'
    const [websiteName, setWebsiteName] = useState('');
    const [description, setDescription] = useState('');
    const [files, setFiles] = useState([]);
    const [dockerfile, setDockerfile] = useState(null);
    const [dockerfileContent, setDockerfileContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleFileSelect = (e) => {
        const selectedFiles = Array.from(e.target.files);
        setFiles(selectedFiles);
        setError('');
    };

    const handleDockerfileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setDockerfile(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setDockerfileContent(e.target.result);
            };
            reader.readAsText(file);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles(droppedFiles);
        setError('');
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const removeFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!websiteName.trim()) {
            setError('Website name is required');
            return;
        }

        if (uploadType === 'archive' && files.length === 0) {
            setError('Please select project files to upload');
            return;
        }

        if (uploadType === 'dockerfile' && !dockerfileContent.trim()) {
            setError('Please provide a Dockerfile');
            return;
        }

        setLoading(true);
        setError('');
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append('name', websiteName);
            formData.append('description', description);
            formData.append('templateType', 'custom');

            if (uploadType === 'archive') {
                files.forEach((file, index) => {
                    formData.append('files', file);
                });
            } else {
                formData.append('dockerfile', dockerfileContent);
            }

            // Create website first
            const createRes = await fetch('/api/websites', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: websiteName,
                    description,
                    templateType: 'custom'
                })
            });

            if (!createRes.ok) {
                const errData = await createRes.json();
                throw new Error(errData.message || 'Failed to create website');
            }

            const { website } = await createRes.json();
            setUploadProgress(30);

            // Upload files
            const uploadRes = await fetch(`/api/uploads/website/${website.id}/files`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            setUploadProgress(60);

            if (!uploadRes.ok) {
                const errData = await uploadRes.json();
                throw new Error(errData.message || 'Failed to upload files');
            }

            setUploadProgress(80);

            // Deploy the website
            const deployRes = await fetch(`/api/websites/${website.id}/deploy`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            setUploadProgress(100);

            if (!deployRes.ok) {
                const errData = await deployRes.json();
                throw new Error(errData.message || 'Failed to deploy website');
            }

            setSuccess('Website created and deployed successfully!');
            setTimeout(() => {
                navigate(`/websites/${website.id}`);
            }, 2000);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Upload Project</h1>
                <p className="text-gray-600 mt-2">Deploy your custom project by uploading files or a Dockerfile</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-red-700">{error}</div>
                </div>
            )}

            {success && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="text-green-700">{success}</div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Website Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Website Name *
                    </label>
                    <input
                        type="text"
                        value={websiteName}
                        onChange={(e) => setWebsiteName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="my-awesome-project"
                        required
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        rows={3}
                        placeholder="Describe your project..."
                    />
                </div>

                {/* Upload Type Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload Type
                    </label>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => setUploadType('archive')}
                            className={`flex-1 p-4 border-2 rounded-lg flex items-center justify-center gap-3 transition-colors ${uploadType === 'archive'
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <FileArchive className="w-6 h-6" />
                            <span className="font-medium">Project Archive</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setUploadType('dockerfile')}
                            className={`flex-1 p-4 border-2 rounded-lg flex items-center justify-center gap-3 transition-colors ${uploadType === 'dockerfile'
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <FileCode className="w-6 h-6" />
                            <span className="font-medium">Dockerfile</span>
                        </button>
                    </div>
                </div>

                {/* File Upload Area */}
                {uploadType === 'archive' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Project Files *
                        </label>
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary-500 transition-colors"
                        >
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600 mb-2">
                                Drag and drop your project files here, or click to browse
                            </p>
                            <p className="text-sm text-gray-400">
                                Supports: .zip, .tar.gz, or individual files
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                                accept=".zip,.tar,.tar.gz,.tgz"
                            />
                        </div>

                        {/* Selected Files List */}
                        {files.length > 0 && (
                            <div className="mt-4 space-y-2">
                                {files.map((file, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                    >
                                        <div className="flex items-center gap-3">
                                            <FileArchive className="w-5 h-5 text-gray-400" />
                                            <span className="text-sm text-gray-700">{file.name}</span>
                                            <span className="text-xs text-gray-400">
                                                ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(index)}
                                            className="text-gray-400 hover:text-red-500"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Dockerfile Upload Area */}
                {uploadType === 'dockerfile' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Dockerfile *
                        </label>
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={() => dockerfileInputRef.current?.click()}
                                className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-primary-500 transition-colors"
                            >
                                <FileCode className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-gray-600">
                                    {dockerfile ? dockerfile.name : 'Click to select a Dockerfile'}
                                </p>
                            </button>
                            <input
                                ref={dockerfileInputRef}
                                type="file"
                                onChange={handleDockerfileSelect}
                                className="hidden"
                                accept="Dockerfile,dockerfile"
                            />

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Or paste Dockerfile content:
                                </label>
                                <textarea
                                    value={dockerfileContent}
                                    onChange={(e) => setDockerfileContent(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    rows={12}
                                    placeholder={`FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Upload Progress */}
                {loading && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                )}

                {/* Submit Button */}
                <div className="flex justify-end gap-4">
                    <button
                        type="button"
                        onClick={() => navigate('/websites')}
                        className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Deploying...
                            </>
                        ) : (
                            <>
                                <Upload className="w-5 h-5" />
                                Deploy Project
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default UploadProject;
