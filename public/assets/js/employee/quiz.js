// Employee Quiz System

document.addEventListener("DOMContentLoaded", () => {

    const questions = [
        {
            question: "Which of the following is a common sign of a phishing email?",
            options: [
                "An urgent request asking you to click a link",
                "A normal company announcement",
                "A scheduled team meeting",
                "A routine newsletter"
            ],
            answer: 0
        },
        {
            question: "What should you do before clicking a link in an unexpected email?",
            options: [
                "Click it immediately",
                "Verify the sender and the destination URL",
                "Forward it to everyone",
                "Reply with your password"
            ],
            answer: 1
        },
        {
            question: "Which request should make you suspicious?",
            options: [
                "A request for your password through an unexpected email",
                "A normal work notification",
                "A calendar reminder",
                "A company holiday announcement"
            ],
            answer: 0
        },
        {
            question: "What is a fake login page designed to do?",
            options: [
                "Improve your internet speed",
                "Collect sensitive information by pretending to be legitimate",
                "Update your computer safely",
                "Create a calendar event"
            ],
            answer: 1
        },
        {
            question: "What is the safest action when you receive a suspicious email?",
            options: [
                "Click the link to investigate",
                "Provide the requested information",
                "Verify the message through a trusted channel",
                "Forward it to random people"
            ],
            answer: 2
        }
    ];

    let currentQuestion = 0;
    let score = 0;
    let selectedAnswer = null;

    const questionNumber = document.getElementById("questionNumber");
    const scoreText = document.getElementById("scoreText");
    const questionText = document.getElementById("questionText");
    const optionsContainer = document.getElementById("optionsContainer");
    const nextQuestionBtn = document.getElementById("nextQuestionBtn");

    const quizContainer = document.getElementById("quizContainer");
    const resultContainer = document.getElementById("resultContainer");
    const finalScore = document.getElementById("finalScore");
    const resultMessage = document.getElementById("resultMessage");

    const retakeQuizBtn = document.getElementById("retakeQuizBtn");
    const backToTrainingBtn = document.getElementById("backToTrainingBtn");


    // Display current question
    function loadQuestion() {

        const question = questions[currentQuestion];

        questionNumber.textContent =
            `Question ${currentQuestion + 1} of ${questions.length}`;

        scoreText.textContent = `Score: ${score}`;

        questionText.textContent = question.question;

        optionsContainer.innerHTML = "";

        selectedAnswer = null;

        question.options.forEach((option, index) => {

            const button = document.createElement("button");

            button.type = "button";
            button.textContent = option;

            button.style.display = "block";
            button.style.width = "100%";
            button.style.marginBottom = "10px";
            button.style.padding = "12px";
            button.style.border = "1px solid #d1d5db";
            button.style.borderRadius = "8px";
            button.style.background = "#ffffff";
            button.style.cursor = "pointer";
            button.style.textAlign = "left";

            button.addEventListener("click", () => {

                selectedAnswer = index;

                // Remove selection from other options
                const allOptions =
                    optionsContainer.querySelectorAll("button");

                allOptions.forEach(optionButton => {
                    optionButton.style.background = "#ffffff";
                });

                // Highlight selected option
                button.style.background = "#e5e7eb";
            });

            optionsContainer.appendChild(button);
        });
    }


    // Move to next question
    nextQuestionBtn.addEventListener("click", () => {

        if (selectedAnswer === null) {
            alert("Please select an answer first.");
            return;
        }

        const correctAnswer = questions[currentQuestion].answer;

        if (selectedAnswer === correctAnswer) {
            score++;
        }

        currentQuestion++;

        if (currentQuestion < questions.length) {

            loadQuestion();

        } else {

            showResult();
        }
    });


    // Show final result
    function showResult() {

        quizContainer.style.display = "none";
        resultContainer.style.display = "block";

        const percentage =
            Math.round((score / questions.length) * 100);

        finalScore.textContent =
            `Your score: ${score}/${questions.length} (${percentage}%)`;

        if (percentage >= 60) {

            resultMessage.textContent =
                "PASS — Great job! You have demonstrated a good understanding of phishing awareness.";

        } else {

            resultMessage.textContent =
                "FAIL — Please review the training material and try the quiz again.";
        }
    }


    // Retake quiz
    retakeQuizBtn.addEventListener("click", () => {

        currentQuestion = 0;
        score = 0;
        selectedAnswer = null;

        quizContainer.style.display = "block";
        resultContainer.style.display = "none";

        loadQuestion();
    });


    // Back to training
    backToTrainingBtn.addEventListener("click", () => {

        window.location.href = "training.html";
    });


    // Start quiz
    loadQuestion();

});