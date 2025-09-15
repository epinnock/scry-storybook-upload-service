# In Dockerfile

# ---- Base Stage ----
# Use a specific, lightweight Node.js version for reproducibility and security.
# 'alpine' variants are smaller than the default Debian-based ones.
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# ---- Dependencies Stage ----
# This stage is dedicated to installing ONLY production dependencies.
# This creates a clean node_modules directory that can be copied to the final image.
FROM base AS deps
COPY package.json yarn.lock* ./
RUN yarn install --production --frozen-lockfile

# ---- Builder Stage ----
# This stage installs all dependencies (including devDependencies) and builds the TypeScript application.
FROM base AS builder
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile
# Copy the rest of the source code.
COPY . .
# Run the build script defined in package.json (e.g., "tsc").
RUN yarn build

# ---- Production Stage ----
# This is the final, minimal image that will be deployed.
FROM base AS production
ENV NODE_ENV=production

# Create a non-root user and group for security.
# Running as a non-root user is a critical security best practice.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy the pre-installed production node_modules from the 'deps' stage.
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy the compiled JavaScript application from the 'builder' stage.
# The 'dist' directory contains the output of the TypeScript compiler.
COPY --from=builder /usr/src/app/dist ./dist

# Copy package.json for metadata (e.g., for monitoring tools to read the app version).
COPY package.json .

# Expose the port the application will listen on.
EXPOSE 3000

# The command to run the application.
# It executes the Node.js entry point from the compiled output.
CMD ["node", "dist/entry.node.js"]
