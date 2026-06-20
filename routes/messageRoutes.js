const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const {
    getConversations,
    getMessages,
    getOrCreateConversation,
    searchUsers
} = require('../controllers/messageController');

// All routes protected
router.use(verifyToken);

router.get('/conversations', getConversations);
router.get('/conversations/:conversationId', getMessages);
router.post('/conversations', getOrCreateConversation);
router.get('/users/search', searchUsers);

module.exports = router;