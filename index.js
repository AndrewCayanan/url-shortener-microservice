require('dotenv').config();
const express = require('express');
const cors = require('cors');
const dns = require('dns');
const mongoose = require('mongoose');
const app = express();

const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
  .catch(err => console.error('Mongo connection error:', err.message));

const urlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true }
});
const Url = mongoose.model('Url', urlSchema);

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

app.post('/api/shorturl', (req, res) => {
  const input = req.body.url;

  let parsed;
  try {
    parsed = new URL(input);
  } catch (e) {
    return res.json({ error: 'invalid url' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.json({ error: 'invalid url' });
  }

  dns.lookup(parsed.hostname, async (err) => {
    if (err) return res.json({ error: 'invalid url' });

    try {
      const existing = await Url.findOne({ original_url: input });
      if (existing) {
        return res.json({
          original_url: existing.original_url,
          short_url: existing.short_url
        });
      }

      const last = await Url.findOne().sort({ short_url: -1 });
      const nextId = last ? last.short_url + 1 : 1;

      const created = await Url.create({ original_url: input, short_url: nextId });
      res.json({
        original_url: created.original_url,
        short_url: created.short_url
      });
    } catch (e) {
      res.status(500).json({ error: 'server error' });
    }
  });
});

app.get('/api/shorturl/:short_url', async (req, res) => {
  try {
    const doc = await Url.findOne({ short_url: Number(req.params.short_url) });
    if (!doc) return res.json({ error: 'No short URL found for the given input' });
    res.redirect(doc.original_url);
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

module.exports = app;
