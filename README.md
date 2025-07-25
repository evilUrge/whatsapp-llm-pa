# WhatsApp LLM Personal Assistant

A sophisticated WhatsApp personal assistant powered by Cloudflare Workers AI that monitors conversations and provides intelligent, secretary-style responses using the llama-3.2-1b-instruct model.

## 🚀 Features

### AI-Powered Response Generation
- **Secretary Mode**: Professional, context-aware responses representing you professionally
- **Cloudflare Workers AI Integration**: Uses llama-3.2-1b-instruct for high-quality responses
- **Conversation Context**: Maintains conversation history and context for relevant responses
- **Content Filtering**: Automatic filtering for appropriate, professional responses
- **Response Personalization**: Adapts tone and style based on conversation type (business/personal)

### Smart Conversation Management
- **Intelligent Timing**: Configurable response delays and cooldown periods
- **Context Analysis**: Analyzes message urgency, sentiment, and category
- **Group Chat Support**: Handles both private and group conversations appropriately
- **Conversation Memory**: Maintains conversation context across interactions

### Advanced Features
- **Health Monitoring**: AI service health checks and rate limit monitoring
- **Error Handling**: Comprehensive retry logic and fallback responses
- **Logging**: Detailed logging for debugging and monitoring
- **Graceful Shutdown**: Proper cleanup of services and data persistence

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18.0.0 or higher
- TypeScript
- Cloudflare account with Workers AI access

### 1. Clone and Install
```bash
git clone <repository-url>
cd whatsapp-llm-pa
npm install
```

### 2. Environment Configuration
Copy the example environment file and configure your settings:
```bash
cp .env.example .env
```

### 3. Required Environment Variables
```bash
# Required - Get from Cloudflare Dashboard
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id

# Optional - AI Configuration
AI_MODEL_NAME=@cf/meta/llama-3.2-1b-instruct
CLOUDFLARE_AI_GATEWAY_URL=your_gateway_url
SECRETARY_MODE=true
```

### 4. Build and Run
```bash
npm run build
npm start

# For development
npm run dev
```

## 🤖 AI Service Architecture

### CloudflareAI Service
The core AI service provides:

#### Key Methods
- `generateResponse(prompt, context?, model?, maxTokens?)` - Generate AI responses with context
- `isHealthy()` - Check AI service health and model availability
- `getModelInfo()` - Get current model information
- `setModel(modelName)` - Switch between available models
- `listModels()` - List all available models
- `checkRateLimit()` - Monitor API rate limits

#### Features
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Rate Limiting**: Built-in rate limit monitoring and warnings
- **Model Switching**: Dynamic model switching with validation
- **Health Checks**: Continuous service health monitoring

### ResponseGenerator Service
Specialized service for generating secretary-style responses:

#### Key Methods
- `generateSecretaryResponse(context)` - Generate professional secretary responses
- `buildSecretaryPrompt(context)` - Build context-aware prompts
- `filterResponse(response)` - Filter and sanitize responses
- `addSecretaryPersonality(response, context)` - Add professional personality

#### Secretary Features
- **Professional Tone**: Maintains appropriate business communication style
- **Context Awareness**: Adapts responses based on conversation history
- **Content Filtering**: Ensures responses are appropriate and professional
- **Personality Injection**: Adds secretary-style language and formatting
- **Conversation Memory**: Maintains context across multiple interactions

## 📋 Configuration Options

### AI Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MODEL_NAME` | `@cf/meta/llama-3.2-1b-instruct` | Cloudflare AI model to use |
| `CLOUDFLARE_MAX_TOKENS` | `500` | Maximum tokens per response |
| `CLOUDFLARE_AI_GATEWAY_URL` | - | Custom gateway URL (optional) |

### Application Settings
| Variable | Default | Description |
|----------|---------|-------------|
| `SECRETARY_MODE` | `true` | Enable professional secretary mode |
| `RESPONSE_DELAY_MS` | `120000` | Delay before responding (2 minutes) |
| `COOLDOWN_PERIOD_MS` | `18000000` | Cooldown after response (5 hours) |
| `MAX_CONTEXT_MESSAGES` | `10` | Messages to include in context |
| `RATE_LIMIT_PER_MINUTE` | `10` | API requests per minute limit |
| `RETRY_ATTEMPTS` | `3` | Number of retry attempts |

## 🔧 Usage Examples

### Basic Usage
```typescript
import { CloudflareAI } from './ai/CloudflareAI';
import { ResponseGenerator } from './ai/ResponseGenerator';

// Initialize AI service
const cloudflareAI = new CloudflareAI(
    'your-api-token',
    'your-account-id',
    undefined, // gateway URL
    '@cf/meta/llama-3.2-1b-instruct'
);

// Create response generator
const responseGenerator = new ResponseGenerator(cloudflareAI);

// Generate secretary response
const context = {
    chatId: 'example-chat',
    participantCount: 2,
    recentMessages: [...],
    isActive: true
};

const response = await responseGenerator.generateSecretaryResponse(context);
console.log(response.content);
```

### Health Monitoring
```typescript
// Check AI service health
const isHealthy = await cloudflareAI.isHealthy();
if (!isHealthy) {
    console.warn('AI service is not available');
}

// Get model information
const modelInfo = await cloudflareAI.getModelInfo();
console.log(`Using model: ${modelInfo?.name}`);

// Check rate limits
const rateLimit = await cloudflareAI.checkRateLimit();
if (rateLimit && rateLimit.remaining < 10) {
    console.warn(`Low rate limit: ${rateLimit.remaining} requests remaining`);
}
```

### Custom Response Generation
```typescript
// Generate response with custom parameters
const response = await cloudflareAI.generateResponse(
    'Hello, how can I help you today?',
    context,
    '@cf/meta/llama-3.2-1b-instruct',
    300 // max tokens
);

// Filter and process response
const filteredResponse = responseGenerator.filterResponse(response);
if (filteredResponse.isAppropriate) {
    console.log('Response approved:', response.content);
} else {
    console.log('Response filtered:', filteredResponse.reason);
}
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │  Message         │    │  Conversation   │
│   Client        │───▶│  Handler         │───▶│  Manager        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Response      │    │  CloudflareAI    │    │  Storage        │
│   Generator     │◀───│  Service         │    │  Service        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Secretary     │    │  Rate Limiting   │    │  Timer          │
│   Personality   │    │  & Health        │    │  Service        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📊 Secretary Mode Features

### Response Characteristics
- **Professional Tone**: Maintains business-appropriate communication
- **Context Awareness**: References previous messages and conversation flow
- **Appropriate Boundaries**: Handles scheduling and availability requests professionally
- **Urgency Recognition**: Prioritizes urgent messages and responds accordingly
- **Group Chat Etiquette**: Adapts behavior for group vs. private conversations

### Message Analysis
- **Sentiment Analysis**: Detects positive, negative, or neutral sentiment
- **Urgency Detection**: Identifies high-priority messages requiring immediate attention
- **Category Classification**: Distinguishes between business, personal, and social messages
- **Response Requirements**: Determines if a message requires a response

### Content Filtering
- **Inappropriate Content**: Filters out unsuitable content automatically
- **Professional Language**: Ensures responses maintain professional standards
- **Length Control**: Keeps responses concise and WhatsApp-appropriate
- **AI Disclosure**: Minimizes mentions of being an AI assistant

## 🚨 Error Handling & Monitoring

### Health Checks
- Automatic service health monitoring every 5 minutes
- Model availability verification
- Rate limit monitoring with warnings
- Automatic failover to fallback responses

### Error Recovery
- Exponential backoff retry logic
- Graceful degradation with fallback responses
- Comprehensive error logging
- Service restart capability

### Monitoring & Logging
- Detailed request/response logging
- Performance metrics tracking
- Error rate monitoring
- Conversation statistics

## 🔒 Security & Privacy

- No sensitive data stored in logs
- Conversation data encrypted at rest
- Rate limiting to prevent abuse
- Content filtering for appropriate responses
- Graceful handling of authentication failures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section below
2. Review the logs for error messages
3. Verify environment configuration
4. Test AI service connectivity

### Common Issues

**AI Service Not Responding**
- Verify Cloudflare API token and account ID
- Check internet connectivity
- Confirm model availability

**High Response Times**
- Monitor rate limits
- Check model performance
- Verify network connectivity

**Memory Issues**
- Review conversation cleanup settings
- Monitor conversation storage
- Adjust context message limits

## 🐳 Docker Deployment

The WhatsApp LLM Personal Assistant is fully containerized with ARM64/Apple Silicon compatibility and optimized for production deployment.

### Prerequisites
- Docker 20.10+ with BuildKit support
- Docker Compose v2.0+
- 1GB+ available RAM
- ARM64 or AMD64 architecture support

### Quick Start with Docker Compose

1. **Clone and prepare environment**:
```bash
git clone <repository-url>
cd whatsapp-llm-pa
cp .env.example .env
# Edit .env with your Cloudflare credentials
```

2. **Deploy with Docker Compose**:
```bash
# Build and start the service
docker-compose up -d

# View logs
docker-compose logs -f whatsapp-llm-pa

# Stop the service
docker-compose down
```

### 📋 Environment Configuration for Docker

Create a `.env` file in your project root:

```bash
# Required Cloudflare AI Configuration
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here

# Optional AI Configuration
AI_MODEL_NAME=@cf/meta/llama-3.2-1b-instruct
CLOUDFLARE_AI_GATEWAY_URL=
CLOUDFLARE_MAX_TOKENS=500

# Application Settings
NODE_ENV=production
SECRETARY_MODE=true
RESPONSE_DELAY_MS=120000
COOLDOWN_PERIOD_MS=18000000
MAX_CONTEXT_MESSAGES=10
ENABLE_LOGGING=true
RATE_LIMIT_PER_MINUTE=10
RETRY_ATTEMPTS=3

# Storage Configuration (handled by Docker volumes)
DATABASE_PATH=/app/data/conversations.db
WHATSAPP_SESSION_PATH=/app/data/session

# Optional: Gilad identification
GILAD_WHATSAPP_ID=
GILAD_WHATSAPP_NUMBER=
GILAD_PHONE_NUMBER=
```

### 🏗️ Building the Docker Image

#### Multi-Architecture Build
```bash
# Build for current architecture
docker build -t whatsapp-llm-pa:latest .

# Build for ARM64 (Apple Silicon)
docker build --platform linux/arm64 -t whatsapp-llm-pa:arm64 .

# Build for AMD64
docker build --platform linux/amd64 -t whatsapp-llm-pa:amd64 .

# Multi-platform build (requires buildx)
docker buildx build --platform linux/arm64,linux/amd64 -t whatsapp-llm-pa:latest .
```

### 🔧 Manual Docker Run

If you prefer not to use Docker Compose:

```bash
# Create data directories
mkdir -p ./data ./sessions ./logs

# Run the container
docker run -d \
  --name whatsapp-llm-pa \
  --restart unless-stopped \
  -e CLOUDFLARE_API_TOKEN="your_token" \
  -e CLOUDFLARE_ACCOUNT_ID="your_account_id" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/sessions:/app/sessions" \
  -v "$(pwd)/logs:/app/logs" \
  whatsapp-llm-pa:latest
```

### 📁 Volume Management

The Docker setup uses three persistent volumes:

| Volume | Purpose | Path |
|--------|---------|------|
| `whatsapp_data` | SQLite database | `./data` |
| `whatsapp_sessions` | WhatsApp authentication | `./sessions` |
| `whatsapp_logs` | Application logs | `./logs` |

#### Volume Commands
```bash
# Backup volumes
docker run --rm -v whatsapp_data:/data -v $(pwd):/backup alpine tar czf /backup/whatsapp-backup.tar.gz /data

# Restore volumes
docker run --rm -v whatsapp_data:/data -v $(pwd):/backup alpine tar xzf /backup/whatsapp-backup.tar.gz -C /

# View volume contents
docker run --rm -v whatsapp_data:/data alpine ls -la /data
```

### 🍎 ARM64/Apple Silicon Support

The Docker configuration is optimized for ARM64 architecture:

#### Chrome/Chromium for ARM
- Uses system Chromium instead of downloading x86 version
- Configured with ARM-specific browser arguments
- Headless browser optimized for container environment

#### Architecture-Specific Notes
```bash
# Check your architecture
uname -m
# arm64 = Apple Silicon/ARM64
# x86_64 = Intel/AMD64

# Force ARM64 build on Apple Silicon
docker build --platform linux/arm64 -t whatsapp-llm-pa:latest .
```

### 🔍 Health Checks and Monitoring

#### Built-in Health Check
```bash
# Check container health
docker ps
# Look for "healthy" status

# View health check logs
docker inspect whatsapp-llm-pa | grep -A5 Health

# Manual health check
docker exec whatsapp-llm-pa node -e "console.log('Health check passed')"
```

#### Monitoring Commands
```bash
# View real-time logs
docker-compose logs -f

# Check resource usage
docker stats whatsapp-llm-pa

# Container inspection
docker inspect whatsapp-llm-pa
```

### 🛠️ Troubleshooting Docker Issues

#### Common Issues and Solutions

**Container fails to start**
```bash
# Check logs
docker-compose logs whatsapp-llm-pa

# Common causes:
# - Missing environment variables
# - Volume permission issues
# - Chrome/Chromium dependencies
```

**Chrome/Chromium issues**
```bash
# Check Chrome installation
docker exec whatsapp-llm-pa /usr/bin/chromium --version

# Test browser dependencies
docker exec whatsapp-llm-pa dpkg -l | grep -E "(chromium|nss|atk)"
```

**Permission issues**
```bash
# Fix volume permissions
sudo chown -R 1000:1000 ./data ./sessions ./logs

# Check container user
docker exec whatsapp-llm-pa id
```

**ARM64 specific issues**
```bash
# Verify platform
docker inspect whatsapp-llm-pa | grep Architecture

# Force ARM64 build
docker build --platform linux/arm64 --no-cache -t whatsapp-llm-pa:latest .
```

#### Debug Mode
```bash
# Enable debug logging
docker-compose run -e DEBUG=true whatsapp-llm-pa

# Interactive shell access
docker exec -it whatsapp-llm-pa /bin/bash

# Check startup process
docker-compose run whatsapp-llm-pa /bin/bash -c "cat /app/docker-entrypoint.sh"
```

### 🚀 Production Deployment

#### Production Checklist
- [ ] Configure production environment variables
- [ ] Set up monitoring and logging
- [ ] Configure backup and recovery
- [ ] Test health check endpoints
- [ ] Set up container orchestration (if needed)
- [ ] Configure reverse proxy if needed
- [ ] Set up SSL/TLS certificates
- [ ] Test failover scenarios
- [ ] Implement log rotation
- [ ] Set up resource limits

#### Docker Compose Production Override
Create `docker-compose.prod.yml`:
```yaml
version: '3.8'
services:
  whatsapp-llm-pa:
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
```

Deploy with production settings:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### Container Updates
```bash
# Pull latest image
docker-compose pull

# Recreate containers with new image
docker-compose up -d --force-recreate

# Zero-downtime update (if using orchestration)
docker service update --image whatsapp-llm-pa:latest whatsapp-service
```

### 📊 Performance Optimization

#### Resource Limits
```yaml
deploy:
  resources:
    limits:
      memory: 1G        # Adjust based on usage
      cpus: '0.5'       # ARM64 is efficient
    reservations:
      memory: 512M
      cpus: '0.25'
```

#### Chrome Optimization for Containers
The Docker setup includes optimized Chrome arguments:
- `--no-sandbox` - Required for containers
- `--disable-dev-shm-usage` - Prevents memory issues
- `--single-process` - ARM64 optimization
- `--disable-gpu` - Headless optimization

### 🔄 Backup and Recovery

#### Automated Backup Script
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
docker run --rm \
  -v whatsapp_data:/data:ro \
  -v whatsapp_sessions:/sessions:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/whatsapp-backup-$DATE.tar.gz /data /sessions
```

#### Recovery Process
```bash
# Stop services
docker-compose down

# Restore from backup
docker run --rm \
  -v whatsapp_data:/data \
  -v whatsapp_sessions:/sessions \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/whatsapp-backup-YYYYMMDD_HHMMSS.tar.gz -C /

# Restart services
docker-compose up -d
```

---

**Version**: 1.0.0
**Last Updated**: 2025-07-25
**Powered by**: Cloudflare Workers AI + llama-3.2-1b-instruct
**Docker Support**: Multi-architecture (ARM64/AMD64) with Chrome/Chromium