module.exports = {
    testEnvironment: "jsdom",
    setupFiles: ["./tests/setupJquery.js"],
    transform: {
      "^.+\\.jsx?$": "babel-jest"
    }
  };
  