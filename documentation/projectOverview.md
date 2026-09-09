# 🛡️ Project Overview

## 1. Introduction

The **Phishing Simulation & Security Training Platform** is a sandbox application designed to simulate phishing attacks in a controlled environment.

The platform allows organizations to test employee awareness of phishing attacks without using real malicious content or storing real credentials.

## 2. Objective

The main objective of the project is to create a platform that can:

* Simulate common phishing scenarios.
* Track employee interactions with simulations.
* Identify employees who may require additional training.
* Provide cybersecurity awareness training.
* Test employee knowledge through quizzes.
* Generate useful reports and analytics for administrators.

## 3. Tech Stack

### ⚙️ Backend

| Technology                   | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| 🟢 **Node.js**               | Backend runtime and application development  |
| 🗄️ **MySQL**                | Database for storing application data        |
| 🔑 **JWT (JSON Web Tokens)** | Authentication and secure session management |

### Frontend

*To be finalized.*

### Other Technologies

*To be finalized based on project requirements.*

## 4. Main Components

### 🔐 Administrator Management

Administrators can log in securely and manage employees, campaigns, training, and reports.

### 👥 Employee Management

The system provides functionality to add and manage employees and import employee information through CSV files.

### 🎣 Phishing Simulation

Administrators can create and schedule controlled phishing campaigns using predefined simulation templates.

The system tracks interactions such as:

* Email opens
* Link clicks
* Landing-page visits

### 🖥️ Simulated Landing Pages

The platform can display harmless simulated login or verification pages.

The system should **never store actual passwords or sensitive credentials**.

### 🎓 Training

Employees who interact with phishing simulations can be assigned cybersecurity awareness lessons.

Training may cover topics such as:

* Recognizing phishing emails
* Identifying suspicious links
* Checking email senders
* Understanding social engineering
* Reporting suspicious messages

### 📝 Quizzes

Employees can complete quizzes after training.

The system records:

* Quiz scores
* Pass/fail status
* Completion status

### ⚠️ Risk Assessment

Employee interaction data can be used to assign a basic risk level:

* 🟢 Low
* 🟡 Medium
* 🔴 High

### 📊 Reports & Analytics

Administrators can view campaign results and generate reports containing simulation and training statistics.

Reports may be exported as **PDF or CSV** files.

## 5. Basic Workflow

```text
Administrator Login
        ↓
Employee Management
        ↓
Create Phishing Campaign
        ↓
Send Simulation
        ↓
Employee Interaction
        ↓
Track Result
        ↓
Risk Assessment
        ↓
Assign Training
        ↓
Employee Completes Quiz
        ↓
Update Progress
        ↓
Generate Report
```

## 6. Development Structure

The project is divided between four developers:

| Developer   | Area                                         |
| ----------- | -------------------------------------------- |
| Developer 1 | Backend, Database, Authentication & Tracking |
| Developer 2 | Training, Quizzes & Risk Detection           |
| Developer 3 | Campaigns, Email Simulation & Landing Pages  |
| Developer 4 | Dashboards, Reports & Progress Tracking      |

## 7. Security Considerations

The platform is intended for **authorized and controlled phishing simulations only**.

The prototype should:

* Use simulated phishing content.
* Avoid storing real passwords.
* Protect employee information.
* Restrict administrative functionality to authorized users.
* Maintain audit logs for important administrative actions.

## 8. Expected Outcome

At the end of development, the project should provide a functional prototype capable of managing the complete phishing simulation lifecycle:

**Create → Simulate → Track → Train → Test → Analyze → Report**

The platform will demonstrate how organizations can use controlled phishing simulations to improve employee cybersecurity awareness.
