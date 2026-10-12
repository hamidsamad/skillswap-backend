import express from 'express';
import { Skill } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

// @route   GET /api/skills
// @desc    Get all skills with optional filters
router.get('/', async (req, res) => {
  try {
    const { category, popular, search } = req.query;
    const filter = {};

    if (category && category !== 'All') {
      filter.category = category;
    }
    if (popular === 'true') {
      filter.isPopular = true;
    }

    let skills = await Skill.find(filter).sort({ name: 1 });

    if (search && search.trim() !== '') {
      const q = search.toLowerCase();
      skills = skills.filter(
        s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, count: skills.length, skills });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/skills
// @desc    Create a new skill (admin only)
router.post('/', protect, requireAdmin, async (req, res) => {
  try {
    const { name, category, description, icon, isPopular } = req.body;

    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'Skill name and category are required' });
    }

    const existing = await Skill.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A skill with this name already exists' });
    }

    const newSkill = await Skill.create({
      name: name.trim(),
      category,
      description: description || '',
      icon: icon || 'Sparkles',
      isPopular: Boolean(isPopular)
    });

    res.status(201).json({ success: true, skill: newSkill });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PUT /api/skills/:id
// @desc    Update a skill (admin only)
router.put('/:id', protect, requireAdmin, async (req, res) => {
  try {
    const { name, category, description, icon, isPopular } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (category) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (icon) updates.icon = icon;
    if (isPopular !== undefined) updates.isPopular = isPopular;

    const updated = await Skill.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }

    res.json({ success: true, skill: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/skills/:id
// @desc    Delete a skill (admin only)
router.delete('/:id', protect, requireAdmin, async (req, res) => {
  try {
    const deleted = await Skill.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    res.json({ success: true, message: 'Skill successfully deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;
