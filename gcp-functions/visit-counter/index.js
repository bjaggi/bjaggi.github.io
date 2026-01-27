const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const bucketName = process.env.BUCKET_NAME || 'jaggi-cp-code';
const basePath = process.env.COUNTER_BASE_PATH || 'temp-counter';
const defaultPage = 'main';

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function sanitizePage(value) {
  return String(value || defaultPage).replace(/[^a-z0-9_-]/gi, '_');
}

function getObjectName(page) {
  return `${basePath}/visit-count-${sanitizePage(page)}.json`;
}

async function loadCount(file) {
  try {
    const [contents] = await file.download();
    const parsed = JSON.parse(contents.toString());
    const count = Number(parsed.count);
    return Number.isFinite(count) ? count : 0;
  } catch (error) {
    if (error.code === 404) {
      return 0;
    }
    throw error;
  }
}

async function saveCount(file, count, preconditionOpts) {
  const payload = JSON.stringify({
    count,
    updatedAt: new Date().toISOString()
  });
  await file.save(payload, {
    contentType: 'application/json',
    resumable: false,
    preconditionOpts
  });
}

async function incrementCounter(page) {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(getObjectName(page));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [exists] = await file.exists();
      let count = 0;
      let preconditionOpts;

      if (exists) {
        const [metadata] = await file.getMetadata();
        count = await loadCount(file);
        preconditionOpts = { ifGenerationMatch: Number(metadata.generation) };
      } else {
        preconditionOpts = { ifGenerationMatch: 0 };
      }

      count += 1;
      await saveCount(file, count, preconditionOpts);
      return count;
    } catch (error) {
      if (error.code === 409 || error.code === 412) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to update counter due to concurrent updates.');
}

exports.visitCounter = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const page = req.query.page || (req.body && req.body.page) || defaultPage;

  try {
    const count = await incrementCounter(page);
    res.status(200).json({ count, page });
  } catch (error) {
    console.error('Counter error:', error);
    res.status(500).json({ error: 'Failed to update counter' });
  }
};

