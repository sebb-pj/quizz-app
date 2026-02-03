import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware 
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error", err));

// Schemas

const AnswerSchema = new mongoose.Schema({
  text: { type: String, required: true },
  traits: { type: Map, of: Number, required: true }
});

const QuestionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
  text: { type: String, required: true },
  answers: [AnswerSchema]
});

const QuizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  tags: [String],
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  results: [
    {
      trait: String,
      title: String,
      description: String
    }
  ],
  isPublished: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now }
});

const QuizAnalyticsSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", unique: true },
  totalAttempts: { type: Number, default: 0 },
  resultCounts: { type: Map, of: Number },
  lastAttemptAt: Date
});

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "user"], default: "user" }
});

// Models
const Quiz = mongoose.model("Quiz", QuizSchema);
const Question = mongoose.model("Question", QuestionSchema);
const QuizAnalytics = mongoose.model("QuizAnalytics", QuizAnalyticsSchema);
const User = mongoose.model("User", UserSchema);

// Routes 

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Create quiz
app.post("/api/quizzes", async (req, res) => {
  try {
    const quiz = await Quiz.create(req.body);
    await QuizAnalytics.create({ quizId: quiz._id, resultCounts: {} });
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fetch published quizzes
app.get("/api/quizzes", async (req, res) => {
  const quizzes = await Quiz.find({ isPublished: true }).select("title description tags");
  res.json(quizzes);
});

// Submit quiz answers
app.post("/api/quizzes/:id/submit", async (req, res) => {
  const { answers } = req.body; // [{ questionId, answerId }]

  const questions = await Question.find({ quizId: req.params.id });

  const scores = {};

  questions.forEach((q) => {
    const userAnswer = answers.find((a) => a.questionId === q.id);
    if (!userAnswer) return;

    const answer = q.answers.id(userAnswer.answerId);
    if (!answer) return;

    for (const [trait, points] of answer.traits.entries()) {
      scores[trait] = (scores[trait] || 0) + points;
    }
  });

  const resultTrait = Object.keys(scores).reduce((a, b) =>
    scores[a] > scores[b] ? a : b
  );

  await QuizAnalytics.findOneAndUpdate(
    { quizId: req.params.id },
    {
      $inc: {
        totalAttempts: 1,
        [`resultCounts.${resultTrait}`]: 1
      },
      lastAttemptAt: new Date()
    }
  );

  res.json({ result: resultTrait, scores });
});

// Server 
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
