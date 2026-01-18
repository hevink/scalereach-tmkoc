# ScaleReach API Documentation

## Swagger API Documentation

The ScaleReach API includes comprehensive OpenAPI documentation for all endpoints. You can access the interactive Swagger UI interface at:

- **Swagger UI:** http://localhost:3001/api-docs
- **OpenAPI JSON Spec:** http://localhost:3001/api-docs.json

## API Modules Documentation

The API is organized into the following modules:

### Authentication Module
These endpoints are handled internally by Better Auth and may not show up in interactive documentation due to internal handling:
- **POST** `/api/auth/register` - Register a new user account (Better Auth internal)
- **POST** `/api/auth/login` - Authenticate user with email and password (Better Auth internal)
- **POST** `/api/auth/logout` - Logout current user session (Better Auth internal)
- **GET** `/api/auth/me` - Get current user profile (Better Auth internal)
- **POST** `/api/auth/forgot-password` - Request password reset (Better Auth internal)
- **POST** `/api/auth/reset-password` - Reset password with token (Better Auth internal)
- **POST** `/api/auth/change-password` - Change current user password (Better Auth internal)

### User Management Module
- **GET** `/api/users` - Get all users
- **GET** `/api/users/{id}` - Get user by ID
- **POST** `/api/users` - Create a new user
- **PUT** `/api/users/{id}` - Update user by ID
- **DELETE** `/api/users/{id}` - Delete user by ID
- **GET** `/api/users/check-username` - Check username availability

### Workspace Management Module
- **GET** `/api/workspaces` - Get all workspaces for current user
- **GET** `/api/workspaces/{id}` - Get workspace by ID
- **GET** `/api/workspaces/slug/{slug}` - Get workspace by slug
- **POST** `/api/workspaces` - Create a new workspace
- **PUT** `/api/workspaces/{id}` - Update workspace by ID
- **PUT** `/api/workspaces/slug/{slug}` - Update workspace by slug
- **DELETE** `/api/workspaces/{id}` - Delete workspace by ID
- **GET** `/api/workspaces/{id}/members` - Get members of a workspace
- **POST** `/api/workspaces/{id}/members` - Add a member to a workspace

### Project Management Module
- **POST** `/api/projects` - Create a new project
- **GET** `/api/projects/workspace/{workspaceId}` - Get projects by workspace ID
- **GET** `/api/projects/{id}` - Get project by ID
- **GET** `/api/projects/{id}/full` - Get project with associated videos
- **PUT** `/api/projects/{id}` - Update project by ID
- **DELETE** `/api/projects/{id}` - Delete project by ID

### Video Management Module
- **POST** `/api/videos/youtube` - Submit a YouTube URL for processing
- **GET** `/api/videos/project/{projectId}` - Get videos by project ID
- **GET** `/api/videos/{id}` - Get video by ID
- **GET** `/api/videos/{id}/status` - Get video processing status
- **DELETE** `/api/videos/{id}` - Delete video by ID
- **GET** `/api/videos/validate-youtube` - Validate a YouTube URL

## How to Access Documentation

1. Start the server: `bun run src/index.ts`
2. Navigate to http://localhost:3001/api-docs in your browser
3. Explore all available endpoints interactively

## Authentication Methods

The API uses Better Auth, which provides internal authentication endpoints. Better Auth endpoints are handled automatically and may not appear in all documentation sections due to their internal handling.

### Better Auth Internal Endpoints:
- `POST /api/auth/login` - Login user
- `POST /api/auth/register` - Register user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user session

### Authentication Methods After Login:

#### Header-based Authentication (Bearer Token)
- **Header**: `Authorization: Bearer {token}`
- Used with most API endpoints requiring authentication after initial login

#### Cookie-based Authentication (Better Auth Session Token)
- **Cookie**: `better-auth.session_token=6MrLXFXnqZTdtg7suXD4uJT3tMeLFp4H.ex4UpDWaV5m8mTR0rmgNyOvrVVopd8kHY4Z60Bv4atM%3D`
- Used with web-based clients leveraging Better Auth sessions (automatically handled by browser)

### Using Better Auth Endpoints:
Better Auth endpoints might show as "404" or "undocumented" in some testing tools because they bypass the normal Hono middleware chain. The proper way to test authentication is:
1. Use your frontend application to initiate login via Better Auth
2. Or use a form-based approach to hit the Better Auth endpoints directly
3. Then use the obtained session token for subsequent API calls

## Documentation Generation

The OpenAPI documentation is automatically generated based on Zod schemas defined in `src/docs/openapi.ts`. The documentation includes:

- Request/response schemas
- HTTP status codes
- Parameter descriptions
- Example payloads
- Authentication requirements
- Detailed endpoint descriptions
- Security schemes for both header and cookie authentication

This documentation makes it easy for developers to understand and interact with the API endpoints without having to dig through source code.