const db = require('../config/db');

/**
 * GET /api/training/modules
 * Get all training modules
 */
const getAllModules = async (req, res) => {
    try {
        const [modules] = await db.execute(
            `SELECT 
                id,
                title,
                content,
                created_at
             FROM TrainingModules
             ORDER BY created_at DESC`
        );

        res.status(200).json({
            success: true,
            count: modules.length,
            data: modules
        });
    } catch (error) {
        console.error('Error fetching training modules:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch training modules'
        });
    }
};


/**
 * GET /api/training/modules/:id
 * Get one training module by ID
 */
const getModuleById = async (req, res) => {
    try {
        const moduleId = Number(req.params.id);

        if (!Number.isInteger(moduleId) || moduleId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid training module ID'
            });
        }

        const [modules] = await db.execute(
            `SELECT 
                id,
                title,
                content,
                created_at
             FROM TrainingModules
             WHERE id = ?`,
            [moduleId]
        );

        if (modules.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Training module not found'
            });
        }

        res.status(200).json({
            success: true,
            data: modules[0]
        });
    } catch (error) {
        console.error('Error fetching training module:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch training module'
        });
    }
};


/**
 * GET /api/training/progress/:employeeId
 * Show training modules completed by an employee
 * using available QuizResults data.
 */
const getEmployeeProgress = async (req, res) => {
    try {
        const employeeId = Number(req.params.employeeId);

        if (!Number.isInteger(employeeId) || employeeId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID'
            });
        }

        // First verify that the employee exists.
        const [employees] = await db.execute(
            `SELECT 
                id,
                name,
                email,
                department,
                risk_level
             FROM Employees
             WHERE id = ?`,
            [employeeId]
        );

        if (employees.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        /*
         * The current database schema does not have a separate
         * EmployeeTraining progress table.
         *
         * Therefore, completed training progress is derived
         * from QuizResults linked to Quizzes and TrainingModules.
         */
        const [progress] = await db.execute(
            `SELECT
                tm.id AS module_id,
                tm.title AS module_title,
                qr.score,
                qr.passed,
                qr.completed_at
             FROM TrainingModules tm
             INNER JOIN Quizzes q
                ON q.module_id = tm.id
             INNER JOIN QuizResults qr
                ON qr.quiz_id = q.id
             WHERE qr.employee_id = ?
             ORDER BY qr.completed_at DESC`,
            [employeeId]
        );

        res.status(200).json({
            success: true,
            employee: employees[0],
            completedModules: progress
        });
    } catch (error) {
        console.error('Error fetching employee training progress:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee training progress'
        });
    }
};


module.exports = {
    getAllModules,
    getModuleById,
    getEmployeeProgress
};
