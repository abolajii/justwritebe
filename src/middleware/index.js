const jwt = require("jsonwebtoken");

const requestLogger = (req, res, next) => {
  // Log the request details
  const { method, url, body, query } = req;
  // console.log(`Request: ${method} ${url}`);
  // console.log(`Query Params:`, query);
  // console.log(`Request Body:`, body);

  // Store the original send method
  const originalSend = res.send;

  // Override res.send to capture response data
  res.send = function (data) {
    console.log(`Response Body:`, data); // Log the response data
    originalSend.call(this, data); // Call the original send method
  };

  next(); // Call the next middleware
};

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1]; // Token is expected in the "Authorization" header as "Bearer <token>"

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access Denied. No token provided." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET); // Verify the token using your secret key
    req.user = verified; // Attach the decoded token data (like user id) to the request object

    console.log(req.user);
    next(); // Continue to the next middleware or route handler
  } catch (error) {
    res.status(400).json({ message: "Invalid Token." });
  }
};

module.exports = { verifyToken, requestLogger };
