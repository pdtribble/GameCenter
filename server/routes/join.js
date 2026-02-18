const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /join/:code — redirect to client with join code pre-filled
router.get('/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();

  if (!code || code.length !== 4) {
    return res.redirect('/?error=invalid_code');
  }

  const lobby = db.prepare("SELECT * FROM lobbies WHERE join_code = ? AND status = 'waiting'").get(code);
  if (!lobby) {
    return res.redirect('/?error=not_found');
  }

  res.redirect(`/?join=${encodeURIComponent(code)}`);
});

module.exports = router;
