// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const dns = require('dns');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve a simple index (optional)
app.get('/', (req, res) => {
  res.send('URL Shortener Microservice is running. POST to /api/shorturl');
});

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/urlshortener';
mongoose.set('strictQuery', true);
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message || err);
    process.exit(1); // optional: stop app if DB unreachable
  });

const db = mongoose.connection;
db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('Connected to MongoDB'));

// Schemas
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

const urlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true }
});
const Url = mongoose.model('Url', urlSchema);

// helper to get next seq for short_url
async function getNextSequence(name = 'url_count') {
  const res = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return res.seq;
}

// POST /api/shorturl
app.post('/api/shorturl', async (req, res) => {
  try {
    const submittedUrl = req.body.url;
    if (!submittedUrl) {
      return res.json({ error: 'invalid url' });
    }

    // Validate URL format using WHATWG URL
    let hostname;
    try {
      const urlObj = new URL(submittedUrl);
      // Only accept http or https
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return res.json({ error: 'invalid url' });
      }
      hostname = urlObj.hostname;
    } catch (err) {
      return res.json({ error: 'invalid url' });
    }

    // Use dns.lookup to check if hostname exists
    dns.lookup(hostname, async (dnsErr) => {
      if (dnsErr) {
        return res.json({ error: 'invalid url' });
      }

      // If DNS OK, check if URL already exists in DB
      try {
        let doc = await Url.findOne({ original_url: submittedUrl }).exec();
        if (doc) {
          return res.json({ original_url: doc.original_url, short_url: doc.short_url });
        }

        // Create new short_url
        const next = await getNextSequence('url_count');
        const newDoc = new Url({ original_url: submittedUrl, short_url: next });
        await newDoc.save();
        return res.json({ original_url: newDoc.original_url, short_url: newDoc.short_url });
      } catch (dbErr) {
        console.error('DB error:', dbErr);
        return res.status(500).json({ error: 'server error' });
      }
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /api/shorturl/:short_url -> redirect
app.get('/api/shorturl/:shorturl', async (req, res) => {
  const short = parseInt(req.params.shorturl, 10);
  if (isNaN(short)) {
    return res.status(400).json({ error: 'Wrong format' });
  }

  try {
    const doc = await Url.findOne({ short_url: short }).exec();
    if (!doc) {
      return res.status(404).json({ error: 'No short URL found for the given input' });
    }
    // Redirect to original URL
    return res.redirect(doc.original_url);
  } catch (err) {
    console.error('DB error on redirect:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
