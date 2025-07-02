import pkg from "@azure/ms-rest-js";
import { ComputerVisionClient } from "@azure/cognitiveservices-computervision";

const { ApiKeyCredentials } = pkg;

const endpoint = process.env.AZURE_COMPUTER_VISION_ENDPOINT;
const apiKey = process.env.AZURE_COMPUTER_VISION_KEY;

const credentials = new ApiKeyCredentials({
  inHeader: { "Ocp-Apim-Subscription-Key": apiKey },
});

const computerVisionClient = new ComputerVisionClient(credentials, endpoint);

export default computerVisionClient;
