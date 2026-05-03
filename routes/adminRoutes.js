'use strict';

const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { getAdminUser, updateAdminUser } = require('../controllers/admin/adminUsersController');

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/users/:id', getAdminUser);
router.put('/users/:id', updateAdminUser);

module.exports = router;
