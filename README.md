1️⃣ Project Summary

Emotional Firewall is an AI-based cybersecurity system that detects phishing and social engineering messages by analyzing emotional manipulation in text.

Instead of only checking malicious links, the system uses Natural Language Processing (NLP) to identify emotional triggers like urgency, fear, or authority that attackers commonly use to trick users. When such patterns are detected, the system calculates a risk score and warns the user before they interact with the message.

Studies on phishing attacks show that attackers often exploit human psychology and emotions rather than technical vulnerabilities, which makes emotional-based detection useful in cybersecurity systems. (Sources: National Institute of Standards and Technology – Social Engineering; Palo Alto Networks Cyberpedia on Social Engineering)

2️⃣ Short Explanation

Traditional spam filters mainly detect:

malicious links

malware signatures

However, many phishing attacks bypass these filters by manipulating emotions such as fear or urgency.

This project solves the problem by:

analyzing message language

detecting emotional triggers

classifying whether the message is suspicious

warning the user in real time

Thus, the system works like a psychological firewall that protects users from social engineering attacks.

3️⃣ Process / Working (Short)

The system works in six steps:

Input Message The user enters or receives a message (email, SMS, etc.).

Preprocessing The text is cleaned and prepared for analysis (removing punctuation, tokenizing words).

NLP Emotion Detection The system analyzes the message to detect emotional triggers such as urgency, fear, or authority.

Classification Model A machine learning model determines whether the message is safe or phishing.

Risk Score Generation The system calculates the probability that the message is a phishing attempt.

User Alert If the risk score is high, the system warns the user and explains why the message is suspicious.

4️⃣ Tech Stack

Frontend: HTML, CSS, JavaScript, React

Backend: Python

Database & Hosting: Firebase

AI & NLP Tools:

Google AI Studio

Gemini AI

Gemini API

Additional Tools: Anti-Gravity (for design/AI experimentation or prototyping)

✅ One-line explanation for viva:

“Emotional Firewall detects phishing attacks by analyzing emotional manipulation in messages using NLP and machine learning, then warns users before they fall victim to social engineering.”
