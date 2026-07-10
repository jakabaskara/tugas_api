const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const Material = require('../models/Material');
const Question = require('../models/Question');
const { extractPdfText } = require('../services/pdf');
const { generateQuestionsFromText } = require('../services/openaiQuestions');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${path.basename(file.originalname)}`),
  }),
});

router.get('/materials', async (_req, res, next) => {
  try {
    const materials = await Material.find().sort({ createdAt: -1 });
    const rows = await Promise.all(
      materials.map(async (material) => ({
        material,
        questionCount: await Question.countDocuments({ materialId: material._id }),
      }))
    );

    res.render('admin/materials', { rows });
  } catch (err) {
    next(err);
  }
});

router.get('/materials/upload', (_req, res) => {
  res.render('admin/upload');
});

router.post('/materials/upload', upload.single('pdf'), async (req, res, next) => {
  const title = String(req.body.title || '').trim();

  if (!title || !req.file || req.file.mimetype !== 'application/pdf') {
    req.flash('error', 'Judul dan file PDF wajib diisi');
    return res.redirect('/admin/materials/upload');
  }

  const material = new Material({
    title,
    filename: req.file.filename,
    uploadedBy: req.session.user.id,
    status: 'ready',
  });
  let materialCreated = false;

  try {
    await material.save();
    materialCreated = true;
    const text = await extractPdfText(await fs.promises.readFile(req.file.path));
    const questions = await generateQuestionsFromText(text);

    await Question.insertMany(
      questions.map((question) => ({
        ...question,
        materialId: material._id,
      }))
    );

    material.status = 'ready';
    await material.save();
    req.flash('success', 'Materi berhasil diupload dan soal berhasil dibuat');
    res.redirect('/admin/materials');
  } catch (err) {
    if (materialCreated) {
      try {
        material.status = 'failed';
        await material.save();
      } catch (saveErr) {
        return next(saveErr);
      }
    }
    req.flash('error', `Gagal memproses materi: ${err.message}`);
    res.redirect('/admin/materials/upload');
  }
});

module.exports = router;
