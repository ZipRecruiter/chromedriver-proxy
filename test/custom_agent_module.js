
const ChromeAgent = require('../lib/chrome_agent.js')

class CustomAgent extends ChromeAgent {
  constructor(options) {
    super(options);
  }
}

module.exports = CustomAgent;
