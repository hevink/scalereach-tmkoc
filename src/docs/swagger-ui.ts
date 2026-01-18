import { Hono } from 'hono';
import { openApiDocument } from './openapi';

// Create a new Hono app for Swagger UI
const swaggerApp = new Hono();

// Serve the OpenAPI JSON specification
swaggerApp.get('/json', (c) => {
  return c.json(openApiDocument);
});

// Serve Swagger UI HTML
swaggerApp.get('/', async (c) => {
  const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ScaleReach API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json', // Absolute path to the JSON spec
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.presets.standalone
        ]
      });
    };
  </script>
</body>
</html>`;

  return c.html(swaggerHtml);
});

export default swaggerApp;