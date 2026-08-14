// Custom validation middlewares for wallet inputs

const validateRecharge = (req, res, next) => {
  const { amount } = req.body;
  if (amount === undefined || amount === null || isNaN(amount) || parseFloat(amount) <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid recharge amount. Must be greater than 0." 
    });
  }
  next();
};

const validateDebit = (req, res, next) => {
  const { amount } = req.body;
  if (amount === undefined || amount === null || isNaN(amount) || parseFloat(amount) <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid debit amount. Must be greater than 0." 
    });
  }
  next();
};

const validateRefund = (req, res, next) => {
  const { order_id, payment_id, cancellation_id, refund_method, refund_amount } = req.body;
  
  if (!order_id || !payment_id || !cancellation_id || !refund_method || refund_amount === undefined || refund_amount === null) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required refund parameters: order_id, payment_id, cancellation_id, refund_method, refund_amount." 
    });
  }

  const validMethods = ["WALLET", "SPLIT", "ORIGINAL_PAYMENT"];
  if (!validMethods.includes(refund_method.toUpperCase())) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid refund method. Choose WALLET, SPLIT, or ORIGINAL_PAYMENT." 
    });
  }

  if (isNaN(refund_amount) || parseFloat(refund_amount) <= 0) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid refund amount. Must be greater than 0." 
    });
  }

  next();
};

module.exports = {
  validateRecharge,
  validateDebit,
  validateRefund
};
