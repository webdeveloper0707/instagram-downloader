
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { instagramGetUrl } = require('instagram-url-direct');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Create directories if they don't exist
const downloadsDir = path.join(__dirname, 'downloads');
const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');

[downloadsDir, uploadsDir, processedDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|mkv|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed!'));
        }
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload and crop endpoint
app.post('/api/crop', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'कृपया कोई file upload करें'
            });
        }

        const { x, y, width, height, format = 'jpeg', quality = 90 } = req.body;
        const inputPath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(fileExt);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(fileExt);

        if (!isImage && !isVideo) {
            return res.status(400).json({
                success: false,
                message: 'Unsupported file format'
            });
        }

        const cropParams = {
            left: parseInt(x) || 0,
            top: parseInt(y) || 0,
            width: parseInt(width) || 100,
            height: parseInt(height) || 100
        };

        const outputFilename = `cropped_${uuidv4()}.${format}`;
        const outputPath = path.join(processedDir, outputFilename);

        if (isImage) {
            // Process image with Sharp
            await sharp(inputPath)
                .extract(cropParams)
                .toFormat(format, { quality: parseInt(quality) })
                .toFile(outputPath);

            // Clean up uploaded file
            fs.unlinkSync(inputPath);

            res.json({
                success: true,
                message: 'Image successfully cropped!',
                filename: outputFilename,
                downloadUrl: `/api/download-processed/${outputFilename}`,
                fileSize: fs.statSync(outputPath).size,
                type: 'image'
            });

        } else if (isVideo) {
            // Process video with FFmpeg
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .videoFilters(`crop=${cropParams.width}:${cropParams.height}:${cropParams.left}:${cropParams.top}`)
                    .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
                    .output(outputPath)
                    .on('end', () => {
                        // Clean up uploaded file
                        fs.unlinkSync(inputPath);
                        resolve();
                    })
                    .on('error', (err) => {
                        reject(err);
                    })
                    .run();
            });

            res.json({
                success: true,
                message: 'Video successfully cropped!',
                filename: outputFilename,
                downloadUrl: `/api/download-processed/${outputFilename}`,
                fileSize: fs.statSync(outputPath).size,
                type: 'video'
            });
        }

    } catch (error) {
        console.error('Crop error:', error);
        res.status(500).json({
            success: false,
            message: 'Crop processing में error आया। कृपया फिर से try करें।'
        });
    }
});

// Get file info endpoint
app.post('/api/file-info', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'कृपया कोई file upload करें'
            });
        }

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(fileExt);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(fileExt);

        let fileInfo = {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            type: isVideo ? 'video' : isImage ? 'image' : 'unknown'
        };

        if (isImage) {
            // Get image dimensions
            const metadata = await sharp(filePath).metadata();
            fileInfo.width = metadata.width;
            fileInfo.height = metadata.height;
            fileInfo.format = metadata.format;
        } else if (isVideo) {
            // Get video info using FFmpeg
            fileInfo = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(filePath, (err, metadata) => {
                    if (err) {
                        reject(err);
                    } else {
                        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                        resolve({
                            ...fileInfo,
                            width: videoStream.width,
                            height: videoStream.height,
                            duration: metadata.format.duration,
                            format: metadata.format.format_name
                        });
                    }
                });
            });
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileInfo: fileInfo
        });

    } catch (error) {
        console.error('File info error:', error);
        res.status(500).json({
            success: false,
            message: 'File info प्राप्त करने में error आया।'
        });
    }
});

// Download processed file
app.get('/api/download-processed/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(processedDir, filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                success: false,
                message: 'File नहीं मिली'
            });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const ext = path.extname(filename).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
            res.setHeader('Content-Type', 'image/' + ext.slice(1));
        } else if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
            res.setHeader('Content-Type', 'video/' + ext.slice(1));
        }

        // Stream file
        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        // Clean up file after download
        stream.on('end', () => {
            setTimeout(() => {
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                    console.log('Cleaned up processed file:', filename);
                }
            }, 5000);
        });

    } catch (error) {
        console.error('Download processed error:', error);
        res.status(500).json({
            success: false,
            message: 'File download करने में error'
        });
    }
});

// Instagram download endpoint (enhanced)
app.post('/api/download', async (req, res) => {
    try {
        const { url, crop = false, x = 0, y = 0, width = 100, height = 100 } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Instagram URL required hai'
            });
        }

        if (!isValidInstagramUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'Valid Instagram URL नहीं है'
            });
        }

        console.log('Processing URL:', url);

        const result = await instagramGetUrl(url);

        if (!result || !result.url_list || result.url_list.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Video URL नहीं मिल रहा। कृपया valid रील URL डालें।'
            });
        }

        const mediaUrl = result.url_list[0];
        const filename = `reel_${Date.now()}.mp4`;
        const filepath = path.join(downloadsDir, filename);

        console.log('Downloading from:', mediaUrl);

        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                console.log('Download completed:', filename);
                
                let finalFilename = filename;
                let finalPath = filepath;
                let downloadUrl = `/api/video/${filename}`;

                // Apply cropping if requested
                if (crop === 'true' || crop === true) {
                    try {
                        const cropParams = {
                            left: parseInt(x) || 0,
                            top: parseInt(y) || 0,
                            width: parseInt(width) || 100,
                            height: parseInt(height) || 100
                        };

                        const croppedFilename = `cropped_${filename}`;
                        const croppedPath = path.join(processedDir, croppedFilename);

                        await new Promise((resolveCrop, rejectCrop) => {
                            ffmpeg(filepath)
                                .videoFilters(`crop=${cropParams.width}:${cropParams.height}:${cropParams.left}:${cropParams.top}`)
                                .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
                                .output(croppedPath)
                                .on('end', () => {
                                    finalFilename = croppedFilename;
                                    finalPath = croppedPath;
                                    downloadUrl = `/api/download-processed/${croppedFilename}`;
                                    resolveCrop();
                                })
                                .on('error', rejectCrop)
                                .run();
                        });

                        // Clean up original file
                        fs.unlinkSync(filepath);
                    } catch (cropError) {
                        console.error('Crop error:', cropError);
                    }
                }

                res.json({
                    success: true,
                    message: crop === 'true' || crop === true ? 'Video successfully cropped and downloaded!' : 'Video successfully download हो गया!',
                    filename: finalFilename,
                    downloadUrl: downloadUrl,
                    fileSize: fs.statSync(finalPath).size,
                    cropped: crop === 'true' || crop === true
                });
                resolve();
            });

            writer.on('error', (error) => {
                console.error('Download error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Download में error आया। कृपया फिर से try करें।'
                });
                reject(error);
            });
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error आया। कृपया बाद में try करें।'
        });
    }
});

// Serve video file
app.get('/api/video/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(downloadsDir, filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({
                success: false,
                message: 'File नहीं मिली'
            });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'video/mp4');

        const stream = fs.createReadStream(filepath);
        stream.pipe(res);

        setTimeout(() => {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log('Cleaned up:', filename);
            }
        }, 3600000);

    } catch (error) {
        console.error('Video serve error:', error);
        res.status(500).json({
            success: false,
            message: 'File serve करने में error'
        });
    }
});

// Utility function to validate Instagram URL
function isValidInstagramUrl(url) {
    const patterns = [
        /^https?:\/\/(?:www\.)?instagram\.com\/reel\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/p\/[A-Za-z0-9_-]+\/?/,
        /^https?:\/\/(?:www\.)?instagram\.com\/tv\/[A-Za-z0-9_-]+\/?/
    ];

    return patterns.some(pattern => pattern.test(url));
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Instagram Reel Downloader & Cropper running on http://localhost:${PORT}`);
    console.log('📁 Downloads will be saved in:', downloadsDir);
    console.log('📁 Uploads will be saved in:', uploadsDir);
    console.log('📁 Processed files will be saved in:', processedDir);
});

module.exports = app;
