import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Call OpenAI with timeout & retries
async function callOpenAI(promptOrMessages, model = null, maxTokens = 16384, retries = 2, timeoutMs = 120000) {
  while (retries > 0) {
    try {
      // Handle both string prompts and message arrays
      let messages;
      
      if (typeof promptOrMessages === 'string') {
        messages = [{ role: "user", content: promptOrMessages }];
      } else if (Array.isArray(promptOrMessages)) {
        messages = promptOrMessages;
      } else {
        messages = [{ role: "user", content: String(promptOrMessages) }];
      }

      const apiParams = {
        model: model || process.env.OPENAI_MODEL || "gpt-5-mini",
        max_completion_tokens: maxTokens,
        temperature: 1,
        messages: messages
      };

      return await Promise.race([
        openai.chat.completions.create(apiParams),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("OpenAI request timed out")), timeoutMs)
        )
      ]);
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      console.log(`Retrying... (${retries} attempts left)`);
    }
  }
}


export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY is not set in environment variables");
      return res.status(500).json({ 
        error: "OpenAI API key is not configured. Please set OPENAI_API_KEY in your environment variables."
      });
    }

    const { profile, jd } = req.body;

    if (!profile) return res.status(400).send("Profile required");
    if (!jd) return res.status(400).send("Job description required");

    // Check if job is remote or hybrid/onsite
    console.log("Checking job location type...");
    const jdLower = jd.toLowerCase();
    
    // Keywords indicating hybrid or onsite positions
    const hybridKeywords = [
      'hybrid', 'hybrid work', 'hybrid model', 'hybrid schedule',
      'days in office', 'days per week in office', 'in-office days',
      'office presence', 'some days in office'
    ];
    
    const onsiteKeywords = [
      'on-site', 'onsite', 'on site', 'in-office', 'in office',
      'office based', 'office-based', 'must be located in',
      'must be based in', 'must relocate', 'relocation required',
      'physical presence required', 'in person', 'local candidates',
      'candidates must be in', 'candidates must reside'
    ];
    
    // Check for hybrid indicators
    const isHybrid = hybridKeywords.some(keyword => jdLower.includes(keyword));
    
    // Check for onsite indicators (but exclude if "remote" is also mentioned strongly)
    const hasOnsiteKeywords = onsiteKeywords.some(keyword => jdLower.includes(keyword));
    const hasRemoteKeywords = jdLower.includes('remote') || jdLower.includes('work from home') || 
                               jdLower.includes('fully remote') || jdLower.includes('100% remote') ||
                               jdLower.includes('remote-first') || jdLower.includes('distributed team');
    const hasJuniorKeywords = jdLower.includes('junior role') || jdLower.includes('entry level') ||
                               jdLower.includes('entry-level');
    
    const hasInternKeywords = jdLower.includes(' intern ') || jdLower.includes('internship');

    const isJunior = hasJuniorKeywords && !hasInternKeywords;
    const isIntern = hasInternKeywords && !hasJuniorKeywords;
    const isEntryLevel = isJunior || isIntern;

    // Determine if it's truly onsite (has onsite keywords but not strong remote indicators)
    const isOnsite = hasOnsiteKeywords && !hasRemoteKeywords;
    
    if (isHybrid) {
      console.log("❌ Job is HYBRID - Rejecting");
      return res.status(400).json({ 
        error: "This position is HYBRID (requires some office days). This tool is designed for REMOTE-ONLY positions. Please provide a fully remote job description.",
        locationType: "hybrid"
      });
    }
    
    if (isOnsite) {
      console.log("❌ Job is ONSITE - Rejecting");
      return res.status(400).json({ 
        error: "This position is ONSITE/IN-PERSON. This tool is designed for REMOTE-ONLY positions. Please provide a fully remote job description.",
        locationType: "onsite"
      });
    }

    if (isEntryLevel) {
      console.log("❌ Job is ENTRY LEVEL - Rejecting");
      return res.status(400).json({ 
        error: "This position is ENTRY LEVEL. This tool is designed for MID-LEVEL and SENIOR positions. Please provide a more senior job description.",
        locationType: "entry-level"
      });
    }
    
    // Check for security clearance requirements
    console.log("Checking for security clearance requirements...");
    const clearanceKeywords = [
      'security clearance', 'clearance required', 'must have clearance', 'active clearance',
      'public trust', 'public-trust', 'secret clearance', 'top secret', 'top-secret',
      'ts/sci', 'ts clearance', 'secret/ts', 'confidential clearance',
      'dod clearance', 'government clearance', 'federal clearance',
      'clearance eligible', 'ability to obtain clearance', 'obtain security clearance',
      'maintain clearance', 'possess clearance', 'hold clearance',
      'interim clearance', 'final clearance', 'adjudicated clearance',
      'naci', 'naclc', 'tier 1', 'tier 2', 'tier 3', 'tier 4', 'tier 5',
      'background investigation', 'suitability determination',
      'ci poly', 'polygraph', 'lifestyle polygraph', 'counterintelligence polygraph'
    ];
    
    const requiresClearance = clearanceKeywords.some(keyword => jdLower.includes(keyword));
    
    if (requiresClearance) {
      console.log("❌ Job requires SECURITY CLEARANCE - Rejecting");
      return res.status(400).json({ 
        error: "This position requires SECURITY CLEARANCE (including Public Trust or higher). This tool is designed for positions that do NOT require any level of security clearance.",
        locationType: "clearance-required"
      });
    }
    
    console.log("✅ Job appears to be REMOTE and no clearance required - Proceeding");

    // Load profile JSON
    console.log(`Loading profile: ${profile}`);
    const profilePath = path.join(process.cwd(), "resumes", `${profile}.json`);
    
    if (!fs.existsSync(profilePath)) {
      return res.status(404).send(`Profile "${profile}" not found`);
    }
    
    const profileData = JSON.parse(fs.readFileSync(profilePath, "utf-8"));


    // Calculate years of experience
    const calculateYears = (experience) => {
      if (!experience || experience.length === 0) return 0;
      
      const parseDate = (dateStr) => {
        if (dateStr.toLowerCase() === "present") return new Date();
        return new Date(dateStr);
      };
      
      const earliest = experience.reduce((min, job) => {
        const date = parseDate(job.start_date);
        return date < min ? date : min;
      }, new Date());
      
      const years = (new Date() - earliest) / (1000 * 60 * 60 * 24 * 365);
      return Math.round(years);
    };

    const yearsOfExperience = calculateYears(profileData.experience);

    // SYSTEM MESSAGE: Static content (cacheable) - Instructions + Profile Data
    const systemMessage = `You are a world-class ATS optimization expert. Create a resume that scores 95-100% on ATS.

**🚨 CRITICAL OUTPUT: Return ONLY valid JSON. No markdown, explanations, or extra text.**
Format: {"company":"...","jobTitle":"...","title":"...","summary":"...","skills":{...},"experience":[...]}

## CANDIDATE PROFILE:
**Name:** ${profileData.name}
**Contact:** ${profileData.email} | ${profileData.phone} | ${profileData.location}
**Years of Experience:** ${yearsOfExperience} years

**WORK HISTORY:**
${profileData.experience.map((job, idx) => {
  const parts = [`${idx + 1}. ${job.company}`];
  if (job.title) parts.push(job.title);
  if (job.location) parts.push(job.location);
  parts.push(`${job.start_date} - ${job.end_date}`);
  return parts.join(' | ');
}).join('\n')}

**EDUCATION:**
${profileData.education.map(edu => `- ${edu.degree}, ${edu.school} (${edu.start_year}-${edu.end_year})`).join('\n')}

---

## RESUME GENERATION INSTRUCTIONS:

### **TASK:**
You will receive a job description. Extract the company name and job title, then generate an ATS-optimized resume tailored to that specific job.

### **1. EXTRACT COMPANY & JOB TITLE**
- Extract company name from JD (if not found, use "")
- Extract job title from JD (if not found, use "Software Engineer")

### **2. EXTRACT DOMAIN KEYWORDS** (Critical for 95%+ score)

Analyze JD "About Us" section for **10-15 domain/compliance keywords** specific to company's product/industry:

**Examples by Domain:**
- **Identity/Security:** passwordless authentication, zero-trust architecture, OAuth2, JWT, SAML, OpenID Connect, WebAuthn, FIDO2, MFA, SSO, biometric security, encryption, key management, PKI, SOC 2, ISO 27001, GDPR
- **Payments/FinTech:** PCI-DSS compliance, payment processing, payment infrastructure, fraud detection, KYC/AML, 3D Secure, tokenization, ACH transfers, subscription billing, reconciliation, merchant services, SOC 2
- **Healthcare:** HIPAA compliance, HL7, FHIR, DICOM, PHI protection, EHR systems, EMR, Epic integration, Cerner, patient privacy, FDA compliance, HITRUST
- **Data/Analytics:** data warehousing, data governance, Snowflake, data lake, data lakehouse, GDPR compliance, data residency, PII protection, data quality, data lineage

**WHERE TO USE:**
- Summary: 3-5 domain keywords (lines 2-4)
- Skills: Dedicated domain category with 10-15 keywords
- Experience: 2-3 bullets MUST include domain keywords

### **3. TITLE**
- Use EXACT job title from JD
- Examples: "Senior Data Scientist", "Senior Full Stack Engineer", "DevOps Engineer"

### **4. SUMMARY** (5-6 lines, 8-12 JD keywords + 3-5 domain keywords)

**Structure:**
- **Line 1:** [JD Title] with ${yearsOfExperience}+ years in [domain from JD] across startup and enterprise environments
- **Line 2:** Expertise in [domain keyword] + [3-4 EXACT JD technologies WITH versions if specified]
- **Line 3:** Proven track record in [domain keyword] + [key achievement with metric: %, $, time, scale]
- **Line 4:** Proficient in [3-4 more JD technologies/methodologies]
- **Line 5:** [Soft skill from JD] professional with experience in [Agile/leadership/collaboration] in fast-paced environments
- **Line 6:** Strong focus on [2-3 key JD skill areas] and delivering scalable, production-ready solutions

**Example (FinTech):**
"Senior Full Stack Engineer with 8+ years building scalable fintech platforms. Expertise in **payment processing systems**, **PCI-DSS compliance**, React.js 18, Node.js 20, and PostgreSQL. Proven track record implementing **fraud detection algorithms** that reduced chargebacks by 40% and processed $500M+ annually. Proficient in AWS infrastructure, Docker, Kubernetes, and **KYC/AML compliance frameworks**. Collaborative problem-solver with experience leading cross-functional teams in fast-paced startup environments. Strong focus on secure payment infrastructure, regulatory compliance, and delivering high-performance financial applications."

### **5. SKILLS** (60-80 total, 5-8 categories)

**Rules:**
- Create categories based on JD focus (Frontend, Backend, Cloud, DevOps, Security, etc.)
- 8-12 skills per category
- Capitalize first letter of each skill
- NO version spam: "React.js" NOT "React.js 18, React.js 17, React.js 16"
- NO database spam: "PostgreSQL" NOT "PostgreSQL 15, 14, 13"
- Group cloud services: "AWS (Lambda, S3, EC2, RDS)" NOT 25 separate items
- 70% JD keywords + 30% complementary skills

**Example (Full Stack Engineer):**
{
  "skills": {
    "Frontend": ["React.js", "Next.js", "TypeScript", "JavaScript", "Tailwind CSS", "Redux", "Vue.js", "HTML5", "CSS3"],
    "Backend": ["Node.js", "Express.js", "Python", "Django", "FastAPI", "GraphQL", "REST APIs"],
    "Databases": ["PostgreSQL", "MongoDB", "Redis", "MySQL", "Elasticsearch"],
    "Cloud & Infrastructure": ["AWS (Lambda, S3, EC2, RDS, CloudFront)", "Docker", "Kubernetes", "Terraform"],
    "DevOps & CI/CD": ["GitLab CI/CD", "GitHub Actions", "Jenkins", "Datadog", "Prometheus"],
    "Testing": ["Jest", "Cypress", "Playwright", "React Testing Library"],
    "Payment & Compliance": ["PCI-DSS", "Payment processing", "Stripe", "Fraud detection", "KYC/AML", "SOC 2"],
    "Tools": ["Git", "Webpack", "Vite", "Figma", "Jira"]
  }
}
Total: ~70 skills (scannable and professional)

**If relevant, create domain-specific category:**
- FinTech → "Payment & Compliance"
- Healthcare → "Healthcare Compliance & Standards"
- Security → "Security & Identity"
- Data → "Data Governance & Compliance"

### **6. EXPERIENCE** (${profileData.experience.length} entries, 6-8 bullets each)

**Requirements:**
- Generate ${profileData.experience.length} job entries matching work history above
- 6-8 bullets per job (most recent jobs get 8, older jobs 5-6)
- 25-35 words per bullet
- Include 2-4 JD keywords per bullet
- EVERY bullet needs a metric (%, $, time, scale, users)
- Add industry context to 2-3 bullets per job

**Bullet Structure:**
[Action Verb] + [JD Technology] + [what you built] + [business impact] + [metric]

**Action Verbs:**
✅ USE: Architected, Engineered, Designed, Built, Developed, Implemented, Optimized, Enhanced, Led, Spearheaded, Automated, Deployed
❌ AVOID: "Responsible for", "Duties included", "Tasked with", "Worked on"

**Industry Context Examples:**
- Amazon → "for e-commerce recommendation system"
- Stripe → "for fintech payment platform"
- Salesforce → "for B2B SaaS customers"
- If unknown → use JD company's industry or default to "SaaS platform"

**Metrics Examples:**
- Performance: "40% faster", "reduced latency by 200ms", "3x throughput"
- Scale: "50K+ users", "10M+ records", "1000+ requests/sec"
- Cost: "saved $500K annually", "reduced AWS costs by 35%"
- Time: "deployment from 2hrs to 15min", "accelerated dev by 40%"
- Quality: "99.9% uptime", "reduced bugs by 50%", "90% code coverage"
- Team: "mentored 5 developers", "led team of 10"

**Example Bullet (with domain keywords):**
"Architected **secure payment processing system** using **PCI-DSS compliant** infrastructure with Node.js 20, PostgreSQL, and Redis, implementing **fraud detection algorithms** and **tokenization** that processed $500M+ annually while reducing chargebacks by 40% and maintaining 99.99% uptime for 2M+ users."

## **🎯 ATS OPTIMIZATION CHECKLIST:**

**Keyword Usage:**
- Use EXACT phrases from JD (not synonyms)
- High-priority keywords appear 3-4x (Skills + Summary + 2-3 bullets)
- All required JD skills in Skills section
- All preferred JD skills in Skills section
- Technology versions match JD if specified

**Content Quality:**
- Natural, human-written flow (not robotic)
- Professional tone throughout
- Varied action verbs
- Strong metrics in every bullet
- Domain keywords integrated naturally

**OUTPUT FORMAT:**
Return ONLY valid JSON with this exact structure:
{
  "company": "Extracted Company Name",
  "jobTitle": "Extracted Job Title",
  "title": "...",
  "summary": "...",
  "skills": {"Category": ["Skill1", "Skill2"]},
  "experience": [{"title": "...", "details": ["bullet1", "bullet2"]}]
}`;

    // USER MESSAGE: Dynamic content (job description)
    const userMessage = `Generate an ATS-optimized resume for the following job description:

${jd}

Remember: Extract company name and job title, then create the tailored resume following all instructions above. Return ONLY valid JSON.`;

    // Call OpenAI with message array for prompt caching
    const messages = [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage }
    ];

    console.log("💾 Using prompt caching: System message (~" + Math.round(systemMessage.length / 4) + " tokens cached)");
    const aiResponse = await callOpenAI(messages);
    
    // Store token usage for response headers
    const tokenUsage = {
      promptTokens: aiResponse.usage?.prompt_tokens || 0,
      completionTokens: aiResponse.usage?.completion_tokens || 0,
      totalTokens: aiResponse.usage?.total_tokens || 0,
      cachedTokens: aiResponse.usage?.prompt_tokens_details?.cached_tokens || 0
    };
    
    // Log token usage to debug if we're hitting limits
    console.log("OpenAI API Response Metadata:");
    console.log("- Model:", aiResponse.model);
    console.log("- Finish reason:", aiResponse.choices[0].finish_reason);
    console.log("- Prompt tokens:", tokenUsage.promptTokens);
    console.log("- Completion tokens:", tokenUsage.completionTokens);
    console.log("- Total tokens:", tokenUsage.totalTokens);
    
    // Log cache performance if available (OpenAI includes cache stats in newer models)
    if (tokenUsage.cachedTokens > 0) {
      const uncached = tokenUsage.promptTokens - tokenUsage.cachedTokens;
      console.log("💰 Cache Performance:");
      console.log(`  - Cached tokens: ${tokenUsage.cachedTokens} (~90% discount)`);
      console.log(`  - New tokens: ${uncached}`);
      console.log(`  - Cache savings: ~${Math.round((tokenUsage.cachedTokens / tokenUsage.promptTokens) * 100)}% of input tokens`);
    }
    
    let content;
    if (aiResponse.choices[0].finish_reason === 'length') {
      console.error("⚠️ WARNING: OpenAI hit max_tokens limit! Response was truncated.");
      console.log("🔄 Retrying with reduced requirements to fit in token limit...");
      
      // Retry with a more concise prompt
      const concisePrompt = prompt
        .replace(/TOTAL: 60-80 skills maximum/g, 'TOTAL: 50-60 skills maximum')
        .replace(/Per category: 8-12 skills/g, 'Per category: 6-10 skills')
        .replace(/6 bullets each/g, '5 bullets each')
        .replace(/5-6 bullets per job/g, '4-5 bullets per job');
      
      const retryResponse = await callOpenAI(concisePrompt);
      console.log("Retry Response Metadata:");
      console.log("- Finish reason:", retryResponse.choices[0].finish_reason);
      console.log("- Completion tokens:", retryResponse.usage?.completion_tokens);
      
      content = retryResponse.choices[0].message.content.trim();
    } else {
      content = aiResponse.choices[0].message.content.trim();
    }
    
    // Check if AI is apologizing instead of returning JSON
    if (content.toLowerCase().startsWith("i'm sorry") || 
        content.toLowerCase().startsWith("i cannot") || 
        content.toLowerCase().startsWith("i apologize")) {
      console.error("AI is apologizing instead of returning JSON:", content.substring(0, 200));
      throw new Error("AI refused to generate resume. The prompt may be too complex. Please try again with a shorter job description or simpler requirements.");
    }
    
    // Enhanced JSON extraction - handle various formats
    // Remove markdown code blocks (case insensitive)
    content = content.replace(/```json\s*/gi, "");
    content = content.replace(/```javascript\s*/gi, "");
    content = content.replace(/```\s*/g, "");
    
    // Remove common prefixes
    content = content.replace(/^(here is|here's|this is|the json is):?\s*/gi, "");
    
    // Try to extract JSON from text if wrapped
    // Look for content between first { and last }
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    } else {
      console.error("No JSON object found in response");
      throw new Error("AI did not return valid JSON format. Please try again.");
    }
    
    content = content.trim();
    
    // Parse JSON with better error handling
    let resumeContent;
    try {
      resumeContent = JSON.parse(content);
    } catch (parseError) {
      console.error("=== JSON PARSE ERROR ===");
      console.error("Parse error:", parseError.message);
      console.error("Content length:", content.length);
      console.error("First 1000 chars:", content.substring(0, 1000));
      console.error("Last 500 chars:", content.substring(Math.max(0, content.length - 500)));
      
      // Try to fix common JSON issues
      try {
        // Remove trailing commas
        let fixedContent = content.replace(/,(\s*[}\]])/g, '$1');
        // Fix unescaped quotes in strings (basic attempt)
        fixedContent = fixedContent.replace(/([^\\])"([^",:}\]]*)":/g, '$1\\"$2":');
        resumeContent = JSON.parse(fixedContent);
        console.log("✅ Successfully parsed after fixing common issues");
      } catch (secondError) {
        console.error("Failed to parse even after fixes");
        throw new Error(`AI returned invalid JSON: ${parseError.message}. Please try again.`);
      }
    }
    
    // Validate required fields
    if (!resumeContent.title || !resumeContent.summary || !resumeContent.skills || !resumeContent.experience) {
      console.error("Missing required fields in AI response:", Object.keys(resumeContent));
      throw new Error("AI response missing required fields (title, summary, skills, or experience)");
    }
    
    // Extract company and job title from AI response
    const company = resumeContent.company || "Unknown Company";
    const jobTitle = resumeContent.jobTitle || "Software Engineer";
    console.log(`Extracted - Company: ${company}, Job Title: ${jobTitle}`);

    console.log("✅ AI content generated successfully");
    console.log("Skills categories:", Object.keys(resumeContent.skills).length);
    console.log("Experience entries:", resumeContent.experience.length);
    
    // Debug: Check if experience has details
    resumeContent.experience.forEach((exp, idx) => {
      console.log(`Experience ${idx + 1}: ${exp.title || 'NO TITLE'} - Details count: ${exp.details?.length || 0}`);
      if (!exp.details || exp.details.length === 0) {
        console.error(`⚠️ WARNING: Experience entry ${idx + 1} has NO DETAILS!`);
      }
    });

    // Load Handlebars template
    const templatePath = path.join(process.cwd(), "templates", "Resume.html");
    const templateSource = fs.readFileSync(templatePath, "utf-8");
    
    // Register Handlebars helpers
    Handlebars.registerHelper('formatKey', function(key) {
      // Convert keys like "Programming Languages" or "frontend" to proper format
      return key;
    });
    
    Handlebars.registerHelper('join', function(array, separator) {
      // Join array elements with separator
      if (Array.isArray(array)) {
        return array.join(separator);
      }
      return '';
    });
    
    const template = Handlebars.compile(templateSource);

    // Prepare data for template
    const templateData = {
      name: profileData.name,
      title: "Senior Software Engineer",
      email: profileData.email,
      phone: profileData.phone,
      location: profileData.location,
      linkedin: profileData.linkedin,
      website: profileData.website,
      summary: resumeContent.summary,
      skills: resumeContent.skills,
      experience: profileData.experience.map((job, idx) => ({
        title: job.title || resumeContent.experience[idx]?.title || "Engineer",
        company: job.company,
        location: job.location,
        start_date: job.start_date,
        end_date: job.end_date,
        details: resumeContent.experience[idx]?.details || []
      })),
      education: profileData.education
    };

    // Render HTML
    const html = template(templateData);
    console.log("HTML rendered from template");

    // Generate PDF with Puppeteer
    const browser = process.env.NODE_ENV === 'production'
      ? await puppeteerCore.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        })
      : await puppeteer.launch({ headless: "new" });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { 
        top: "15mm", 
        bottom: "15mm", 
        left: "0mm", 
        right: "0mm" 
      },
    });
    await browser.close();

    console.log("PDF generated successfully!");
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${profileData.name.replace(' ', '_')}_${company}_${jobTitle}.pdf`);
    
    // Add token usage to response headers
    res.setHeader("X-Prompt-Tokens", tokenUsage.promptTokens.toString());
    res.setHeader("X-Completion-Tokens", tokenUsage.completionTokens.toString());
    res.setHeader("X-Total-Tokens", tokenUsage.totalTokens.toString());
    res.setHeader("X-Cached-Tokens", tokenUsage.cachedTokens.toString());
    
    res.end(pdfBuffer);
    

  } catch (err) {
    console.error("❌ PDF generation error:", err);
    console.error("Error stack:", err.stack);
    console.error("Error details:", {
      message: err.message,
      name: err.name,
      code: err.code
    });
    
    // Return JSON error for better debugging
    return res.status(500).json({
      error: "PDF generation failed",
      message: err.message,
      details: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
  }
}
