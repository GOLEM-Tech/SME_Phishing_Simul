const submitCredentials = async (req, res) => {
    try {
        const { token, email } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Tracking token is required'
            });
        }

        console.log('Credential submission detected');
        console.log('Tracking token:', token);
        console.log('Submitted email:', email || 'Not provided');

        res.status(200).json({
            success: true,
            message: 'Credential submission detected',
            event: 'CredentialSubmitted',
            token: token
        });

    } catch (error) {
        console.error('Credential submission failed:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to process credential submission'
        });
    }
};

module.exports = {
    submitCredentials
};