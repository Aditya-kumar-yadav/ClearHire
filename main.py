import os
from src.parser import parse_resumes
from src.layer_1_semantic import calculate_semantic_score

def main():
    print('Starting AI Candidate Matcher pipeline...')
    # Step 1: Parse Resumes
    # Step 2: Extract JD
    # Step 3: Run the 5 layers of scoring
    # Step 4: Export to data/output/
    print('Pipeline complete. Check data/output/ for results.')

if __name__ == '__main__':
    main()
