// routes/teacher/materials.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { verifyToken } = require('../middleware/auth'); // adjust if your middleware file exports a different name
const Class = require('../models/Class');
const Material = require('../models/Material');
const User = require('../models/User'); // optional, only if you want teacher/uploader data

/**
 * GET /teacher/materials
 * Query params (optional):
 *   - classId: filter by specific class id
 *   - page: page number (default 1)
 *   - limit: items per page (default 20)
 *
 * Response: list of materials for classes taught by logged-in teacher.
 */
router.get('/materials', verifyToken, async (req, res) => {
  try {
    // only teachers allowed
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Only teachers can access this endpoint' });
    }

    const teacherId = req.user._id;
    const { classId, page = 1, limit = 20 } = req.query;

    // Validate optional classId
    if (classId && !mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ message: 'Invalid classId format' });
    }

    // 1) Find classes taught by this teacher (or validate classId belongs to them)
    const teacherClasses = await Class.find({ teacher: teacherId }).select('_id name').lean();
    if (!teacherClasses || teacherClasses.length === 0) {
      return res.status(200).json({ message: 'No classes assigned to this teacher', materials: [] });
    }

    const allowedClassIds = teacherClasses.map(c => c._id.toString());

    // If client requested a specific classId, ensure teacher owns it
    if (classId && !allowedClassIds.includes(classId.toString())) {
      return res.status(403).json({ message: 'You are not the teacher of the requested class' });
    }

    // Build query: materials in teacher's classes (or a single class if provided)
    const query = {
      classId: classId ? mongoose.Types.ObjectId(classId) : { $in: allowedClassIds.map(id => mongoose.Types.ObjectId(id)) }
    };

    // Pagination
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10) || 20)); // limit between 1 and 100

    // Fetch total count and paginated materials
    const [total, materials] = await Promise.all([
      Material.countDocuments(query),
      Material.find(query)
        .sort({ createdAt: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .populate('classId', 'name')                // include class name
        .populate('uploadedBy', 'name email')       // include uploader info (optional)
        .lean()
    ]);

    // Shape response
    const results = materials.map(m => ({
      id: m._id,
      title: m.title,
      description: m.description || null,
      fileUrl: m.fileUrl || null,
      classId: m.classId?._id || m.classId,
      className: m.classId?.name || null,
      uploadedBy: m.uploadedBy ? { id: m.uploadedBy._id, name: m.uploadedBy.name, email: m.uploadedBy.email } : null,
      createdAt: m.createdAt
    }));

    return res.status(200).json({
      total,
      page: pg,
      limit: lim,
      totalPages: Math.ceil(total / lim),
      materials: results
    });

  } catch (error) {
    console.error('GET /teacher/materials error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
