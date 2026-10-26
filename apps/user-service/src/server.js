require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

app.get("/users", (req, res) => {
  res.status(200).json({
    success: true,
    service: "user-service",
    message: "User Service is running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "user-service",
    status: "healthy",
  });
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});