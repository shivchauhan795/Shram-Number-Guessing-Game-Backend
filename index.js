import express from "express"
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import authMiddleware from './auth.js'
import cors from 'cors'
import bodyParser from 'body-parser'

dotenv.config()

// for local
// const mongourl = 'mongodb://localhost:27017'
// const client = new MongoClient(mongourl)

// for production
const mongourl = process.env.MONGO_URL
const client = new MongoClient(mongourl, {
    tls: true,  // Enable TLS
    tlsInsecure: true,  // Ensure certificates are validated
    connectTimeoutMS: 10000,
})

const dbName = 'shram'
const app = express()
const port = process.env.PORT || 3000;
await client.connect()

// for local
// app.use(cors());

// for production
app.use(cors({
  origin: 'https://shram-assignment.netlify.app/', // Specify your frontend domain
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true // Allow cookies or other credentials to be sent
}));
app.options('*', cors()); // Preflight response to all routes


app.use(bodyParser.json())


// register 
app.post("/register", async (request, response) => {
  try {
    const hashedPassword = await bcrypt.hash(request.body.password, 10);
    const db = client.db(dbName);
    const collection = db.collection('users');
    const user = {
      email: request.body.email,
      password: hashedPassword,
    }

    const alreadyExist = await collection.findOne({ email: request.body.email })

    if (alreadyExist) {
      return response.status(409).send({
        message: "User with this email already exists",
      });
    }

    const result = await collection.insertOne(user);
    response.status(201).send({
      message: "User Created Successfully",
      result,
    });


  } catch (error) {
    response.status(500).send({
      message: "Error creating user",
      error,
    });
  }

});

//login
app.post("/login", async (request, response) => {
  try {
    const db = client.db(dbName);
    const collection = db.collection('users');
    const user = await collection.findOne({ email: request.body.email });
    if (!user) {
      return response.status(404).send({
        message: "Email not found",
      });
    }
    const match = await bcrypt.compare(request.body.password, user.password);

    if (!match) {
      return response.status(401).send({
        message: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        userEmail: user.email,
      },
      "RANDOM-TOKEN",
      { expiresIn: "24h" }
    );
    response.status(200).send({
      message: "Login successful",
      user: {
        email: user.email,
        token,
      }
    });

  } catch (error) {
    response.status(404).send({
      message: "Email not found",
      error,
    });
  }
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post("/saveScore", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { score } = req.body;

    if (!score || typeof score !== 'number') {
      return res.status(400).send({ message: 'Invalid score value' });
    }

    const db = client.db(dbName);
    const collection = db.collection('scores');

    // Add the new score to the scores array or create a new array if it doesn't exist
    const result = await collection.updateOne(
      { userId: userId },
      { $push: { scores: score } },  // Push the new score into the array
      { upsert: true }  // Create a new document if one doesn't exist
    );

    res.status(200).send({ message: 'Score saved successfully!' });
  } catch (error) {
    res.status(500).send({ message: 'Error saving score', error: error.message });
  }
});

app.get("/getScores", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const db = client.db(dbName);
    const collection = db.collection('scores');

    // Fetch all scores for the authenticated user
    const result = await collection.findOne({ userId: userId }, { projection: { scores: 1 } });

    if (result && result.scores) {
      res.status(200).send({ scores: result.scores });
    } else {
      res.status(404).send({ message: "No scores found" });
    }
  } catch (error) {
    res.status(500).send({ message: 'Error fetching scores', error: error.message });
  }
});


// Endpoint to get the user's high score
app.get("/getHighScore", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const db = client.db(dbName);
    const collection = db.collection('scores');

    // Fetch the document for the authenticated user
    const result = await collection.findOne({ userId: userId });

    if (result && result.scores && Array.isArray(result.scores) && result.scores.length > 0) {
      // Find the highest score in the array
      const highScore = Math.max(...result.scores);
      res.status(200).send({ highScore });
    } else {
      res.status(404).send({ message: "No scores found" });
    }
  } catch (error) {
    res.status(500).send({ message: 'Error fetching high score', error: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Example app listening on port ${port}`);
});

// free endpoint
app.get("/free-endpoint", (request, response) => {
  response.json({ message: "You are free to access me anytime" });
});

// authentication endpoint
app.get("/auth-endpoint", authMiddleware, (request, response) => {
  response.json({ message: "You are authorized to access me" });
});