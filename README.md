# RecruitIQ 🧠 

> An AI-powered Candidate Ranking Platform built for modern enterprise HR teams.
> Evaluates resumes through a 5-layer hybrid semantic pipeline and generates personalized AI interview guides.

## Tech Stack
* **Frontend**: Vanilla HTML/JS/CSS (Stateless, Headless, Flexbox/Grid UI)
* **Backend API**: Python 3, FastAPI, Uvicorn
* **AI/ML Layer**: Sentence-Transformers, Scikit-learn, Google Gemini (LLM)

---

## 🚀 Quick Start Guide

Follow these steps to run RecruitIQ locally on any machine.

### 1. Prerequisites
Ensure you have **Python 3.10+** installed on your machine.

### 2. Configure Environment Secrets
1. In the root directory, create a file named `.env`
2. Add your Google Gemini API key inside it like this:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

### 3. Install Dependencies
Run the following command in the root folder to install all required AI models and backend packages:
```bash
pip install -r requirements.txt
```

### 4. Start the Application
Boot up the integrated server with a single command:
```bash
python main.py
```

* **Frontend UI & API**: The system will automatically host itself at `http://localhost:8000`

---

## Features
* **Resume Parsing:** Drag & drop PDFs for automatic local metadata extraction.
* **5-Layer Evaluation:** Evaluates Semantic text, exact Taxonomies, Years of Experience ratios, Neural Project Portfolios, and GitHub metrics.
* **Generative Verdicts:** Uses Gemini LLM to give personalized Hire/Reject recommendations.
* **AI Interview Guide:** Generates 3 hyper-targeted technical questions for any candidate based on their specific weak points.
* **Bias Detection:** Flags potentially biased language in Job Descriptions to ensure equitable hiring.
