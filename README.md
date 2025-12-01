# 🚀 AI Resume Tailor

An intelligent resume generator powered by OpenAI that creates ATS-optimized, tailored resumes from job descriptions.

## ✨ Features

- **Smart Extraction**: Automatically extracts company name and job title from job descriptions using AI
- **ATS Optimization**: Generates resumes scoring 95-100% on ATS systems
- **Profile Management**: Store multiple resume profiles with different work histories
- **One-Click Generation**: Simply select your profile and paste the job description
- **PDF Export**: Download professionally formatted PDF resumes
- **Cost-Efficient**: Uses OpenAI prompt caching to reduce API costs by ~90% on cached content
- **Smart Validation**: Automatically rejects jobs requiring:
  - Hybrid or onsite work (remote-only)
  - Entry-level positions (mid/senior only)
  - Security clearance (including Public Trust or higher)

## 🛠️ Setup

### Prerequisites

- Node.js 20.x
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   cd Resume-Tailor_v1.1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-5-mini
   NODE_ENV=development
   ```

4. **Add your resume profiles**
   
   Create JSON files in the `resumes/` directory (see `resumes/_template.json` for format)

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to `http://localhost:3000`

## 📝 How to Use

1. **Select Profile**: Choose your resume profile from the dropdown
2. **Paste Job Description**: Copy and paste the full job description from the posting
3. **Generate**: Click "Generate Tailored Resume" and wait 30-45 seconds
4. **Download**: Your ATS-optimized PDF will download automatically

The AI will:
- Extract the company name and job title from the job description
- Analyze required skills and keywords
- Generate a tailored summary, skills section, and experience bullets
- Optimize for ATS compatibility with 95-100% score

After generation, you'll see:
- **Token usage breakdown**: Input tokens (with cache info), output tokens, total tokens
- **Estimated cost**: Real-time cost calculation based on gpt-5-mini pricing
- **Cache savings**: Percentage of tokens served from cache (after first request)

## 🔧 Technology Stack

- **Frontend**: Next.js, React
- **AI**: OpenAI gpt-5-mini with Prompt Caching
- **PDF Generation**: Puppeteer
- **Template Engine**: Handlebars

## 💰 Cost Optimization

This application uses **OpenAI's Prompt Caching** feature to significantly reduce API costs:

- **What gets cached**: Your resume profile data + all ATS optimization instructions (~3,000 tokens)
- **What changes**: Only the job description (~500 tokens per request)
- **Cost savings**: ~90% discount on cached tokens (after first request)

**Pricing (gpt-5-mini)**:
- Input: $0.25 per 1M tokens
- Cached input: $0.025 per 1M tokens (90% discount)
- Output: $2.00 per 1M tokens

**Example Cost Breakdown** (10 resume generations with ~3,500 input + 2,000 output tokens each):
- Without caching: ~$0.049
- With caching: ~$0.041
- **Savings: ~16% on total costs, ~90% on cached input**

The system automatically caches your profile data, so subsequent resumes for the same profile are much cheaper and faster!

## 📄 License

Private project

## 🤝 Contributing

This is a personal project. Feel free to fork and modify for your own use.
