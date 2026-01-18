import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { createRoute, z } from '@hono/zod-openapi';

// Create registry for defining routes and schemas
const registry = new OpenAPIRegistry();

// Register security components properly
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Enter your Bearer token in the format: Bearer {token}",
});

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "Better Auth session token cookie. Format: better-auth.session_token={token}",
});

// Define schemas for auth module
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
});

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  image: z.string().url().nullable(),
  emailVerified: z.boolean(),
});

// Define schemas for user module
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  image: z.string().nullable(),
  username: z.string().nullable(),
});

export const CreateUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
});

export const UpdateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  image: z.string().url().optional(),
  username: z.string().optional(),
});

// Define schemas for workspace module
export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  ownerId: z.string(),
  description: z.string().nullable(),
  logo: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  slug: z.string(),
  ownerId: z.string(),
  description: z.string().optional(),
  logo: z.string().optional(),
});

export const UpdateWorkspaceSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  logo: z.string().optional(),
});

export const WorkspaceMemberSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  joinedAt: z.string().datetime(),
});

export const AddWorkspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
});

// Define schemas for project module
export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdBy: z.string(),
  status: z.enum(['draft', 'processing', 'completed', 'failed']).optional().default('draft'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateProjectSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'processing', 'completed', 'failed']).optional(),
});

// Define schemas for video module
export const VideoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  fileName: z.string(),
  storageKey: z.string().nullable(),
  storageUrl: z.string().nullable(),
  sourceType: z.enum(['youtube', 'upload']),
  sourceUrl: z.string().nullable(),
  status: z.enum(['pending', 'downloading', 'uploading', 'completed', 'failed']).default('pending'),
  title: z.string().nullable(),
  duration: z.number().nullable(),
  fileSize: z.number().nullable(),
  mimeType: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const SubmitYouTubeUrlSchema = z.object({
  projectId: z.string(),
  youtubeUrl: z.string().url('Invalid YouTube URL'),
});

export const YouTubeValidationResponseSchema = z.object({
  valid: z.boolean(),
  videoInfo: z.object({
    id: z.string(),
    title: z.string(),
    duration: z.number(),
    thumbnail: z.string().url(),
  }).optional(),
  error: z.string().optional(),
});

// Define auth routes
export const registerRoute = createRoute({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Authentication'],
  summary: 'Register a new user',
  description: 'Creates a new user account with email and password authentication.',
  request: {
    body: {
      description: 'Registration details',
      content: {
        'application/json': {
          schema: RegisterSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Registration successful',
      content: {
        'application/json': {
          schema: z.object({
            user: UserProfileSchema,
            session: z.object({
              id: z.string(),
              userId: z.string(),
              expiresAt: z.string().datetime(),
              token: z.string(),
            }),
          }),
        },
      },
    },
    400: {
      description: 'Invalid input or user already exists',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const loginRoute = createRoute({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Authentication'],
  summary: 'Login user',
  description: 'Authenticates user with email and password.',
  request: {
    body: {
      description: 'Login credentials',
      content: {
        'application/json': {
          schema: LoginSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: z.object({
            user: UserProfileSchema,
            session: z.object({
              id: z.string(),
              userId: z.string(),
              expiresAt: z.string().datetime(),
              token: z.string(),
            }),
          }),
        },
      },
    },
    400: {
      description: 'Invalid credentials or missing fields',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Invalid email or password',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const logoutRoute = createRoute({
  method: 'post',
  path: '/api/auth/logout',
  tags: ['Authentication'],
  summary: 'Logout user',
  description: 'Logs out the current user and invalidates the session.',
  responses: {
    200: {
      description: 'Logout successful',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const userProfileRoute = createRoute({
  method: 'get',
  path: '/api/auth/me',
  tags: ['Authentication'],
  summary: 'Get current user profile',
  description: 'Returns the profile of the currently authenticated user.',
  responses: {
    200: {
      description: 'User profile retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            user: UserProfileSchema,
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const forgotPasswordRoute = createRoute({
  method: 'post',
  path: '/api/auth/forgot-password',
  tags: ['Authentication'],
  summary: 'Request password reset',
  description: 'Initiates password reset process by sending reset link to email.',
  request: {
    body: {
      description: 'Email to send password reset link to',
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email('Invalid email address'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password reset email sent',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid email format',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const resetPasswordRoute = createRoute({
  method: 'post',
  path: '/api/auth/reset-password',
  tags: ['Authentication'],
  summary: 'Reset password',
  description: 'Changes user password using reset token.',
  request: {
    body: {
      description: 'New password and reset token',
      content: {
        'application/json': {
          schema: z.object({
            token: z.string(),
            newPassword: z.string().min(8, 'Password must be at least 8 characters'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password reset successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid token or new password',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Invalid or expired reset token',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const changePasswordRoute = createRoute({
  method: 'post',
  path: '/api/auth/change-password',
  tags: ['Authentication'],
  summary: 'Change current user password',
  description: 'Changes the password of the currently authenticated user.',
  middleware: [], // Will be protected by auth middleware
  request: {
    body: {
      description: 'Current and new passwords',
      content: {
        'application/json': {
          schema: z.object({
            currentPassword: z.string(),
            newPassword: z.string().min(8, 'New password must be at least 8 characters'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password changed successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Invalid current password or not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

// Define user routes
export const getAllUsersRoute = createRoute({
  method: 'get',
  path: '/api/users',
  tags: ['Users'],
  summary: 'Get all users',
  description: 'Returns a list of all users in the system.',
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  responses: {
    200: {
      description: 'Users retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(UserSchema),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getUserByIdRoute = createRoute({
  method: 'get',
  path: '/api/users/{id}',
  tags: ['Users'],
  summary: 'Get user by ID',
  description: 'Returns details of a specific user.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'User retrieved successfully',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const createUserRoute = createRoute({
  method: 'post',
  path: '/api/users',
  tags: ['Users'],
  summary: 'Create a new user',
  description: 'Creates a new user in the system.',
  request: {
    body: {
      description: 'User creation details',
      content: {
        'application/json': {
          schema: CreateUserSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const updateUserRoute = createRoute({
  method: 'put',
  path: '/api/users/{id}',
  tags: ['Users'],
  summary: 'Update user by ID',
  description: 'Updates details of an existing user.',
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      description: 'Updated user details',
      content: {
        'application/json': {
          schema: UpdateUserSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User updated successfully',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/api/users/{id}',
  tags: ['Users'],
  summary: 'Delete user by ID',
  description: 'Deletes a user from the system.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'User deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const checkUsernameRoute = createRoute({
  method: 'get',
  path: '/api/users/check-username',
  tags: ['Users'],
  summary: 'Check username availability',
  description: 'Checks if a username is available for registration.',
  request: {
    query: z.object({
      username: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Username availability check result',
      content: {
        'application/json': {
          schema: z.object({
            available: z.boolean(),
          }),
        },
      },
    },
    400: {
      description: 'Missing username parameter',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

// Define workspace routes
export const getAllWorkspacesRoute = createRoute({
  method: 'get',
  path: '/api/workspaces',
  tags: ['Workspaces'],
  summary: 'Get all workspaces for the current user',
  description: 'Returns a list of all workspaces the current user belongs to.',
  responses: {
    200: {
      description: 'Workspaces retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(WorkspaceSchema),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getWorkspaceByIdRoute = createRoute({
  method: 'get',
  path: '/api/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Get workspace by ID',
  description: 'Returns details of a specific workspace.',
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Workspace retrieved successfully',
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getWorkspaceBySlugRoute = createRoute({
  method: 'get',
  path: '/api/workspaces/slug/{slug}',
  tags: ['Workspaces'],
  summary: 'Get workspace by slug',
  description: 'Returns details of a specific workspace using its slug.',
  request: {
    params: z.object({
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Workspace retrieved successfully',
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/api/workspaces',
  tags: ['Workspaces'],
  summary: 'Create a new workspace',
  description: 'Creates a new workspace in the system.',
  request: {
    body: {
      description: 'Workspace creation details',
      content: {
        'application/json': {
          schema: CreateWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Workspace created successfully',
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const updateWorkspaceRoute = createRoute({
  method: 'put',
  path: '/api/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Update workspace by ID',
  description: 'Updates details of an existing workspace.',
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      description: 'Updated workspace details',
      content: {
        'application/json': {
          schema: UpdateWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace updated successfully',
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const updateWorkspaceBySlugRoute = createRoute({
  method: 'put',
  path: '/api/workspaces/slug/{slug}',
  tags: ['Workspaces'],
  summary: 'Update workspace by slug',
  description: 'Updates details of an existing workspace using its slug.',
  request: {
    params: z.object({
      slug: z.string(),
    }),
    body: {
      description: 'Updated workspace details',
      content: {
        'application/json': {
          schema: UpdateWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace updated successfully',
      content: {
        'application/json': {
          schema: WorkspaceSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const deleteWorkspaceRoute = createRoute({
  method: 'delete',
  path: '/api/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Delete workspace by ID',
  description: 'Deletes a workspace from the system.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Workspace deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getWorkspaceMembersRoute = createRoute({
  method: 'get',
  path: '/api/workspaces/{id}/members',
  tags: ['Workspaces'],
  summary: 'Get members of a workspace',
  description: 'Returns a list of all members in a specific workspace.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Workspace members retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(WorkspaceMemberSchema),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const addWorkspaceMemberRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{id}/members',
  tags: ['Workspaces'],
  summary: 'Add a member to a workspace',
  description: 'Adds a user as a member to a specific workspace.',
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      description: 'New member details',
      content: {
        'application/json': {
          schema: AddWorkspaceMemberSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Member added to workspace successfully',
      content: {
        'application/json': {
          schema: WorkspaceMemberSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

// Define project routes
export const createProjectRoute = createRoute({
  method: 'post',
  path: '/api/projects',
  tags: ['Projects'],
  summary: 'Create a new project',
  description: 'Creates a new project in a workspace.',
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: {
    body: {
      description: 'Project creation details',
      content: {
        'application/json': {
          schema: CreateProjectSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Project created successfully',
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getProjectsByWorkspaceRoute = createRoute({
  method: 'get',
  path: '/api/projects/workspace/{workspaceId}',
  tags: ['Projects'],
  summary: 'Get projects by workspace ID',
  description: 'Returns a list of all projects in a specific workspace.',
  request: {
    params: z.object({
      workspaceId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Projects retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(ProjectSchema),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getProjectByIdRoute = createRoute({
  method: 'get',
  path: '/api/projects/{id}',
  tags: ['Projects'],
  summary: 'Get project by ID',
  description: 'Returns details of a specific project.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Project retrieved successfully',
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getProjectWithVideosRoute = createRoute({
  method: 'get',
  path: '/api/projects/{id}/full',
  tags: ['Projects'],
  summary: 'Get project with associated videos',
  description: 'Returns details of a specific project along with its associated videos.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Project with videos retrieved successfully',
      content: {
        'application/json': z.object({
          ...ProjectSchema.shape,
          videos: z.array(VideoSchema),
        }),
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const updateProjectRoute = createRoute({
  method: 'put',
  path: '/api/projects/{id}',
  tags: ['Projects'],
  summary: 'Update project by ID',
  description: 'Updates details of an existing project.',
  request: {
    params: z.object({
      id: z.string(),
    }),
    body: {
      description: 'Updated project details',
      content: {
        'application/json': {
          schema: UpdateProjectSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Project updated successfully',
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
    },
    400: {
      description: 'Invalid input',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/api/projects/{id}',
  tags: ['Projects'],
  summary: 'Delete project by ID',
  description: 'Deletes a project from the system.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Project deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

// Define video routes
export const submitYouTubeUrlRoute = createRoute({
  method: 'post',
  path: '/api/videos/youtube',
  tags: ['Videos'],
  summary: 'Submit a YouTube URL for processing',
  description: 'Submits a YouTube URL to be processed and added to a project.',
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  request: {
    body: {
      description: 'YouTube URL and project ID',
      content: {
        'application/json': {
          schema: SubmitYouTubeUrlSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Video submitted for processing successfully',
      content: {
        'application/json': z.object({
          message: z.string(),
          video: VideoSchema,
        }),
      },
    },
    400: {
      description: 'Invalid input or YouTube URL',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getVideosByProjectRoute = createRoute({
  method: 'get',
  path: '/api/videos/project/{projectId}',
  tags: ['Videos'],
  summary: 'Get videos by project ID',
  description: 'Returns a list of all videos associated with a specific project.',
  request: {
    params: z.object({
      projectId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Videos retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(VideoSchema),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getVideoByIdRoute = createRoute({
  method: 'get',
  path: '/api/videos/{id}',
  tags: ['Videos'],
  summary: 'Get video by ID',
  description: 'Returns details of a specific video.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Video retrieved successfully',
      content: {
        'application/json': {
          schema: VideoSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Video not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const getVideoStatusRoute = createRoute({
  method: 'get',
  path: '/api/videos/{id}/status',
  tags: ['Videos'],
  summary: 'Get video processing status',
  description: 'Returns the current processing status of a video and its associated job information.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Video status retrieved successfully',
      content: {
        'application/json': z.object({
          video: VideoSchema,
          job: z.object({
            id: z.string(),
            state: z.string(),
            progress: z.number(),
            data: z.any(),
            failedReason: z.string().nullable(),
            processedOn: z.number().nullable(),
            finishedOn: z.number().nullable(),
          }).nullable(),
        }),
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Video not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const deleteVideoRoute = createRoute({
  method: 'delete',
  path: '/api/videos/{id}',
  tags: ['Videos'],
  summary: 'Delete video by ID',
  description: 'Deletes a video from the system.',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Video deleted successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Video not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

export const validateYouTubeUrlRoute = createRoute({
  method: 'get',
  path: '/api/videos/validate-youtube',
  tags: ['Videos'],
  summary: 'Validate a YouTube URL',
  description: 'Validates a YouTube URL and returns information about the video.',
  request: {
    query: z.object({
      url: z.string().url('Invalid URL format'),
    }),
  },
  responses: {
    200: {
      description: 'YouTube URL validation result',
      content: {
        'application/json': YouTubeValidationResponseSchema,
      },
    },
    400: {
      description: 'Invalid URL format or missing parameter',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

// Register all routes
registry.registerPath(registerRoute);
registry.registerPath(loginRoute);
registry.registerPath(logoutRoute);
registry.registerPath(userProfileRoute);
registry.registerPath(forgotPasswordRoute);
registry.registerPath(resetPasswordRoute);
registry.registerPath(changePasswordRoute);

registry.registerPath(getAllUsersRoute);
registry.registerPath(getUserByIdRoute);
registry.registerPath(createUserRoute);
registry.registerPath(updateUserRoute);
registry.registerPath(deleteUserRoute);
registry.registerPath(checkUsernameRoute);

registry.registerPath(getAllWorkspacesRoute);
registry.registerPath(getWorkspaceByIdRoute);
registry.registerPath(getWorkspaceBySlugRoute);
registry.registerPath(createWorkspaceRoute);
registry.registerPath(updateWorkspaceRoute);
registry.registerPath(updateWorkspaceBySlugRoute);
registry.registerPath(deleteWorkspaceRoute);
registry.registerPath(getWorkspaceMembersRoute);
registry.registerPath(addWorkspaceMemberRoute);

registry.registerPath(createProjectRoute);
registry.registerPath(getProjectsByWorkspaceRoute);
registry.registerPath(getProjectByIdRoute);
registry.registerPath(getProjectWithVideosRoute);
registry.registerPath(updateProjectRoute);
registry.registerPath(deleteProjectRoute);

registry.registerPath(submitYouTubeUrlRoute);
registry.registerPath(getVideosByProjectRoute);
registry.registerPath(getVideoByIdRoute);
registry.registerPath(getVideoStatusRoute);
registry.registerPath(deleteVideoRoute);
registry.registerPath(validateYouTubeUrlRoute);

// Generate OpenAPI specification
export const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'ScaleReach API',
    description: 'ScaleReach API documentation for Authentication, Users, Workspaces, Projects, and Videos',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
    {
      url: 'https://api.scalereach.com',
      description: 'Production server',
    },
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'Endpoints for user authentication and session management'
    },
    {
      name: 'Users',
      description: 'Endpoints for managing user accounts'
    },
    {
      name: 'Workspaces',
      description: 'Endpoints for managing workspaces and their members'
    },
    {
      name: 'Projects',
      description: 'Endpoints for managing projects within workspaces'
    },
    {
      name: 'Videos',
      description: 'Endpoints for managing videos, including YouTube URL processing'
    }
  ]
});

