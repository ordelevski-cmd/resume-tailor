import { useState, useEffect } from "react";

export default function Home() {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [jd, setJd] = useState("");
  const [disable, setDisable] = useState(false);

  // Load profiles on mount
  useEffect(() => {
    fetch("/api/profiles")
      .then(res => res.json())
      .then(data => setProfiles(data))
      .catch(err => console.error("Failed to load profiles:", err));
  }, []);


  const generatePDF = async () => {
    if (disable) return;
    if (!selectedProfile) return alert("Please select a profile");
    if (!jd) return alert("Please enter the Job Description");

    setDisable(true);

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          profile: selectedProfile,
          jd: jd
        })
      });

      if (!genRes.ok) {
        const errorText = await genRes.text();
        console.error('Error response:', errorText);
        
        // Try to parse as JSON to get detailed error
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.locationType === 'hybrid') {
            alert("⚠️ HYBRID POSITION DETECTED\n\nThis job requires some office days. This tool is designed for REMOTE-ONLY positions.\n\nPlease provide a fully remote job description.");
            setDisable(false);
            return;
          } else if (errorJson.locationType === 'onsite') {
            alert("⚠️ ONSITE/IN-PERSON POSITION DETECTED\n\nThis job is not remote. This tool is designed for REMOTE-ONLY positions.\n\nPlease provide a fully remote job description.");
            setDisable(false);
            return;
          } else if (errorJson.locationType === 'entry-level') {
            alert("⚠️ ENTRY LEVEL POSITION DETECTED\n\nThis job is ENTRY LEVEL. This tool is designed for MID-LEVEL and SENIOR positions. Please provide a more senior job description.");
            setDisable(false);
            return;
          } else if (errorJson.locationType === 'clearance-required') {
            alert("⚠️ SECURITY CLEARANCE REQUIRED\n\nThis job requires security clearance (including Public Trust or higher). This tool is designed for positions that do NOT require any level of security clearance.\n\nPlease provide a job description without clearance requirements.");
            setDisable(false);
            return;
          }
          throw new Error(errorJson.error || "Failed to generate PDF");
        } catch (e) {
          throw new Error(errorText || "Failed to generate PDF");
        }
      }

      const blob = await genRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Get filename from Content-Disposition header or use profile name
      const contentDisposition = genRes.headers.get('Content-Disposition');
      let fileName = 'resume.pdf';
      
      if (contentDisposition) {
        const matches = /filename=([^;]+)/.exec(contentDisposition);
        if (matches && matches[1]) {
          fileName = matches[1].trim();
        }
      } else {
        // Fallback to profile name
        const profile = profiles.find(p => p.id === selectedProfile);
        const profileName = profile ? profile.name : "Profile";
        fileName = `${profileName}_resume.pdf`;
      }
      
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);

      // Get token usage from response headers
      const promptTokens = genRes.headers.get('X-Prompt-Tokens') || '0';
      const completionTokens = genRes.headers.get('X-Completion-Tokens') || '0';
      const totalTokens = genRes.headers.get('X-Total-Tokens') || '0';
      const cachedTokens = genRes.headers.get('X-Cached-Tokens') || '0';
      
      // Calculate cost (gpt-5-mini pricing: $0.25/1M input, $0.025/1M cached, $2.00/1M output)
      const inputCost = ((parseInt(promptTokens) - parseInt(cachedTokens)) * 0.25 / 1000000) + (parseInt(cachedTokens) * 0.025 / 1000000);
      const outputCost = parseInt(completionTokens) * 2.00 / 1000000;
      const totalCost = inputCost + outputCost;
      
      // Display success message with token usage
      let message = "✅ Resume generated successfully!\n\n";
      message += "📊 Token Usage:\n";
      message += `• Input: ${promptTokens} tokens`;
      if (parseInt(cachedTokens) > 0) {
        message += ` (${cachedTokens} cached)`;
      }
      message += `\n• Output: ${completionTokens} tokens`;
      message += `\n• Total: ${totalTokens} tokens`;
      message += `\n• Estimated cost: $${totalCost.toFixed(4)}`;
      
      alert(message);
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDisable(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "40px 20px" }}>
      <div style={{ maxWidth: "800px", width: "100%", background: "#fff", borderRadius: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: "50px" }}>
        
        <h1 style={{ fontSize: "36px", fontWeight: "bold", color: "#333", marginBottom: "10px", textAlign: "center" }}>
          🚀 AI Resume Tailor
        </h1>
        <p style={{ fontSize: "16px", color: "#666", marginBottom: "40px", textAlign: "center" }}>
          Select your profile, paste the job description, and get an ATS-optimized resume in seconds!
        </p>

        {/* Profile Selection */}
        <div style={{ marginBottom: "30px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#333", marginBottom: "8px" }}>
            Select Profile <span style={{ color: "#e74c3c" }}>*</span>
          </label>
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: "16px",
              border: "2px solid #e0e0e0",
              borderRadius: "12px",
              outline: "none",
              transition: "all 0.3s",
              cursor: "pointer"
            }}
          >
            <option value="">-- Select a profile --</option>
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>

        {/* Job Description */}
        <div style={{ marginBottom: "30px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#333", marginBottom: "8px" }}>
            Job Description <span style={{ color: "#e74c3c" }}>*</span>
          </label>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description here... (requirements, responsibilities, qualifications)"
            rows="12"
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: "15px",
              border: "2px solid #e0e0e0",
              borderRadius: "12px",
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              transition: "all 0.3s"
            }}
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={generatePDF}
          disabled={disable}
          style={{
            width: "100%",
            padding: "16px",
            fontSize: "18px",
            fontWeight: "bold",
            color: "#fff",
            background: disable ? "#ccc" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            border: "none",
            borderRadius: "12px",
            cursor: disable ? "not-allowed" : "pointer",
            transition: "all 0.3s",
            boxShadow: disable ? "none" : "0 4px 15px rgba(102, 126, 234, 0.4)"
          }}
        >
          {disable ? "⏳ Generating Resume (30-45 seconds)..." : "✨ Generate Tailored Resume"}
        </button>

        {/* Info Box */}
        <div style={{ marginTop: "30px", padding: "20px", background: "#f8f9fa", borderRadius: "12px", border: "1px solid #e0e0e0" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", marginBottom: "12px" }}>
            💡 How it works:
          </h3>
          <ul style={{ fontSize: "14px", color: "#666", lineHeight: "1.8", paddingLeft: "20px", margin: 0 }}>
            <li>Select your profile (name, contacts, work history, education)</li>
            <li>Paste the job description you're applying for</li>
            <li>AI analyzes JD and generates: title, summary, skills, experience bullets</li>
            <li>Download ATS-optimized PDF resume tailored to the job!</li>
          </ul>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "30px", textAlign: "center", fontSize: "14px", color: "#999" }}>
          <p style={{ margin: 0 }}>
            Powered by OpenAI gpt-5-mini • ATS Score: 95-100%
          </p>
        </div>
      </div>
    </div>
  );
}
