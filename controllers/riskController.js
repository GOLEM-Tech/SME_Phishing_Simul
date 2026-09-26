/**
 * Risk Scoring Controller
 *
 * Calculates a user's phishing risk score based on
 * the highest-risk action they performed.
 *
 * Scoring:
 * Opened email       = 40
 * Clicked link       = 70
 * Submitted credentials = 100
 *
 * Risk levels:
 * 0-39   = Low
 * 40-69  = Medium
 * 70-100 = High
 */

const RISK_SCORES = {
    Opened: 40,
    Clicked: 70,
    CredentialSubmitted: 100
};

const calculateRisk = (events) => {
    if (!Array.isArray(events) || events.length === 0) {
        return {
            score: 0,
            riskLevel: 'Low',
            highestRiskAction: 'None'
        };
    }

    let highestScore = 0;
    let highestRiskAction = 'None';

    for (const event of events) {
        const score = RISK_SCORES[event];

        if (score && score > highestScore) {
            highestScore = score;
            highestRiskAction = event;
        }
    }

    let riskLevel;

    if (highestScore >= 70) {
        riskLevel = 'High';
    } else if (highestScore >= 40) {
        riskLevel = 'Medium';
    } else {
        riskLevel = 'Low';
    }

    return {
        score: highestScore,
        riskLevel,
        highestRiskAction
    };
};


/**
 * POST /api/risk/calculate
 *
 * Expected request:
 * {
 *     "events": [
 *         "Opened",
 *         "Clicked"
 *     ]
 * }
 */
const calculateRiskScore = async (req, res) => {
    try {
        const { events } = req.body;

        if (!Array.isArray(events)) {
            return res.status(400).json({
                success: false,
                message: 'Events must be provided as an array'
            });
        }

        const result = calculateRisk(events);

        res.status(200).json({
            success: true,
            message: 'Risk score calculated successfully',
            data: result
        });

    } catch (error) {
        console.error('Error calculating risk score:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to calculate risk score'
        });
    }
};


module.exports = {
    calculateRisk,
    calculateRiskScore
};