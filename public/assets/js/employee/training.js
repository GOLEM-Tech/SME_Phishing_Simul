// Employee Training Module

document.addEventListener("DOMContentLoaded", () => {
    const completeTrainingBtn = document.getElementById("completeTrainingBtn");
    const startQuizBtn = document.getElementById("startQuizBtn");
    const progressText = document.getElementById("progressText");
    const progressBar = document.getElementById("progressBar");

    let trainingCompleted = false;

    completeTrainingBtn.addEventListener("click", () => {
        trainingCompleted = true;

        // Update progress
        progressText.textContent = "100%";
        progressBar.style.width = "100%";

        // Update button
        completeTrainingBtn.textContent = "Training Completed";
        completeTrainingBtn.disabled = true;

        // Enable quiz
        startQuizBtn.disabled = false;

        alert("Training completed successfully! You can now take the quiz.");
    });

    startQuizBtn.addEventListener("click", () => {
        if (!trainingCompleted) {
            alert("Please complete the training first.");
            return;
        }

        window.location.href = "quiz.html";
    });
});