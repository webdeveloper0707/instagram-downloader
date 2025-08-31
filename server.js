
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

// Configure multer for memory storage (no disk storage)
const upload = multer({
    storage: multer.memoryStorage(),
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

// Upload and crop endpoint - Direct download without storage
app.post('/api/crop', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'कृपया कोई file upload करें'
            });
        }

        const { x, y, width, height, format = 'jpeg', quality = 90 } = req.body;
        const fileBuffer = req.file.buffer;
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

        if (isImage) {
            // Process image with Sharp and stream directly
            const processedBuffer = await sharp(fileBuffer)
                .extract(cropParams)
                .toFormat(format, { quality: parseInt(quality) })
                .toBuffer();

            // Set headers for direct download
            res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
            res.setHeader('Content-Type', `image/${format}`);
            res.setHeader('Content-Length', processedBuffer.length);

            // Send processed image directly
            res.send(processedBuffer);

        } else if (isVideo) {
            // For video, we need temporary files for FFmpeg processing
            const tempInputPath = path.join(__dirname, `temp_input_${uuidv4()}.mp4`);
            const tempOutputPath = path.join(__dirname, `temp_output_${uuidv4()}.mp4`);

            // Write buffer to temporary file
            fs.writeFileSync(tempInputPath, fileBuffer);

            await new Promise((resolve, reject) => {
                ffmpeg(tempInputPath)
                    .videoFilters(`crop=${cropParams.width}:${cropParams.height}:${cropParams.left}:${cropParams.top}`)
                    .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
                    .output(tempOutputPath)
                    .on('end', () => {
                        // Set headers for direct download
                        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
                        res.setHeader('Content-Type', 'video/mp4');

                        // Stream processed video directly
                        const stream = fs.createReadStream(tempOutputPath);
                        stream.pipe(res);

                        // Clean up temporary files after streaming
                        stream.on('end', () => {
                            setTimeout(() => {
                                if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                                if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                            }, 1000);
                        });

                        resolve();
                    })
                    .on('error', (err) => {
                        // Clean up on error
                        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                        reject(err);
                    })
                    .run();
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

// Get file info endpoint - Memory storage version
app.post('/api/file-info', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'कृपया कोई file upload करें'
            });
        }

        const fileBuffer = req.file.buffer;
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
            // Get image dimensions from buffer
            const metadata = await sharp(fileBuffer).metadata();
            fileInfo.width = metadata.width;
            fileInfo.height = metadata.height;
            fileInfo.format = metadata.format;
        } else if (isVideo) {
            // For video, create temporary file for FFmpeg probe
            const tempPath = path.join(__dirname, `temp_probe_${uuidv4()}.mp4`);
            fs.writeFileSync(tempPath, fileBuffer);

            try {
                fileInfo = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(tempPath, (err, metadata) => {
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
            } finally {
                // Clean up temporary file
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        }

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


// Instagram download endpoint - Direct download without storage
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

        // If cropping is not requested, stream directly to user
        if (crop !== 'true' && crop !== true) {
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'video/mp4');
            
            response.data.pipe(res);
            return;
        }

        // If cropping is requested, we need temporary processing
        const tempInputPath = path.join(__dirname, `temp_input_${uuidv4()}.mp4`);
        const tempOutputPath = path.join(__dirname, `temp_output_${uuidv4()}.mp4`);

        // Save to temporary file for cropping
        const writer = fs.createWriteStream(tempInputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                console.log('Download completed, starting crop:', filename);
                
                try {
                    const cropParams = {
                        left: parseInt(x) || 0,
                        top: parseInt(y) || 0,
                        width: parseInt(width) || 100,
                        height: parseInt(height) || 100
                    };

                    const croppedFilename = `cropped_${filename}`;

                    await new Promise((resolveCrop, rejectCrop) => {
                        ffmpeg(tempInputPath)
                            .videoFilters(`crop=${cropParams.width}:${cropParams.height}:${cropParams.left}:${cropParams.top}`)
                            .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
                            .output(tempOutputPath)
                            .on('end', () => {
                                // Set headers for direct download
                                res.setHeader('Content-Disposition', `attachment; filename="${croppedFilename}"`);
                                res.setHeader('Content-Type', 'video/mp4');

                                // Stream cropped video directly
                                const stream = fs.createReadStream(tempOutputPath);
                                stream.pipe(res);

                                // Clean up temporary files after streaming
                                stream.on('end', () => {
                                    setTimeout(() => {
                                        if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                                        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                                    }, 1000);
                                });

                                resolveCrop();
                            })
                            .on('error', (err) => {
                                // Clean up on error
                                if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                                if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                                rejectCrop(err);
                            })
                            .run();
                    });

                    resolve();
                } catch (cropError) {
                    console.error('Crop error:', cropError);
                    // Clean up on error
                    if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
                    if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                    
                    res.status(500).json({
                        success: false,
                        message: 'Crop processing में error आया।'
                    });
                    reject(cropError);
                }
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
    console.log('✨ Direct download enabled - No server storage required!');
    console.log('🔄 Files are processed in memory and streamed directly to users');
    console.log('🧹 Temporary files are automatically cleaned up');
});

module.exports = app;
