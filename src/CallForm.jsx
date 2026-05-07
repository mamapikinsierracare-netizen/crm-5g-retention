import { useState, useEffect } from 'react';
import { supabase } from "./supabase";// relative path from src/components to src

export default function CallForm({ client, customer, user, onCallSubmitted, onSuccess }) {
  // Allow either 'client' or 'customer' prop
  const customerData = client || customer;
  // Use either callback
  const onSubmitCallback = onCallSubmitted || onSuccess;

  const [formData, setFormData] = useState({
    call_type: 'Health Check',
    disability_range: '',
    call_status_detail: '',
    package_type: customerData?.current_package || '',
    service_status: '',
    call_outcome: '',
    response_outcome: '',
    agent_comment: '',
    invoice_requested: false,
    other_reason: '',
  });
  const [loading, setLoading] = useState(false);

  // Prefill from latest activity
  useEffect(() => {
    if (!customerData) return;
    const fetchLatest = async () => {
      const { data } = await supabase
        .from('call_activities')
        .select('*')
        .eq('client_account_id', customerData.account_id)
        .order('call_time', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const latest = data[0];
        setFormData(prev => ({
          ...prev,
          call_type: latest.call_type,
          disability_range: latest.disability_range || '',
          call_status_detail: latest.call_status_detail || '',
          package_type: latest.package_type || customerData.current_package,
          service_status: latest.service_status || '',
          call_outcome: latest.call_outcome || '',
          response_outcome: latest.response_outcome || '',
          agent_comment: latest.agent_comment || '',
          invoice_requested: latest.invoice_requested || false,
        }));
      } else {
        setFormData({
          call_type: 'Health Check',
          disability_range: '',
          call_status_detail: '',
          package_type: customerData.current_package,
          service_status: '',
          call_outcome: '',
          response_outcome: '',
          agent_comment: '',
          invoice_requested: false,
          other_reason: '',
        });
      }
    };
    fetchLatest();
  }, [customerData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCallTypeChange = (e) => {
    const newType = e.target.value;
    let newRange = '';
    if (newType === 'Payment Reminder') newRange = '0-29 days';
    if (newType === 'Health Check') newRange = '';
    setFormData(prev => ({
      ...prev,
      call_type: newType,
      disability_range: newRange,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerData) {
      alert('No customer selected');
      return;
    }
    setLoading(true);

    // Get user email: either from prop or from auth
    let agentEmail = user?.email;
    if (!agentEmail) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      agentEmail = authUser?.email;
    }
    if (!agentEmail) {
      alert('Unable to identify agent. Please log in again.');
      setLoading(false);
      return;
    }

    let finalComment = formData.agent_comment;
    if (formData.response_outcome === 'Other' && formData.other_reason.trim()) {
      finalComment = finalComment 
        ? `${finalComment}\n[Other: ${formData.other_reason}]`
        : `[Other: ${formData.other_reason}]`;
    }

    // Insert the call activity
    const newActivity = {
      client_account_id: customerData.account_id,
      call_type: formData.call_type,
      disability_range: formData.disability_range,
      call_status_detail: formData.call_status_detail,
      package_type: formData.package_type,
      service_status: formData.service_status,
      call_outcome: formData.call_outcome,
      response_outcome: formData.response_outcome,
      package_price_at_time: customerData.package_price,
      agent_comment: finalComment,
      agent_email: agentEmail,
      call_time: new Date().toISOString(),
      invoice_requested: formData.invoice_requested,
    };

    const { data: callData, error: callError } = await supabase
      .from('call_activities')
      .insert([newActivity])
      .select();

    if (callError) {
      alert('Error saving call: ' + callError.message);
      setLoading(false);
      return;
    }

    const insertedCall = callData[0];

    // If invoice was requested, create an invoice request record
    if (formData.invoice_requested && insertedCall) {
      const { error: invoiceError } = await supabase
        .from('invoice_requests')
        .insert([{
          client_account_id: customerData.account_id,
          call_activity_id: insertedCall.id,
          requested_by: agentEmail,
          requested_at: new Date().toISOString(),
          status: 'pending',
        }]);
      if (invoiceError) {
        console.error('Failed to create invoice request:', invoiceError);
        alert('Call saved but invoice request failed. Please contact support.');
      } else {
        alert('Call saved and invoice request created.');
      }
    } else {
      alert('Call saved successfully');
    }

    if (onSubmitCallback) onSubmitCallback(); // refresh parent
    setFormData(prev => ({ ...prev, other_reason: '' }));
    setLoading(false);
  };

  if (!customerData) return null;

  const showMainFields = () => {
    if (formData.call_type === 'Health Check') return true;
    if (formData.call_type === 'Payment Reminder') return true;
    if (formData.call_type === 'Winback' && formData.disability_range) return true;
    return false;
  };

  return (
    <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
      <h3>Log New Call</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '10px' }}>
          <label>Call Type:</label>
          <select name="call_type" value={formData.call_type} onChange={handleCallTypeChange}>
            <option>Health Check</option>
            <option>Payment Reminder</option>
            <option>Winback</option>
          </select>
        </div>

        {formData.call_type === 'Winback' && (
          <div style={{ marginBottom: '10px', border: '1px solid #ddd', padding: '10px', borderRadius: '5px' }}>
            <label><strong>Step 1: Select disability period (required)</strong></label>
            <select
              name="disability_range"
              value={formData.disability_range}
              onChange={handleChange}
              required
            >
              <option value="">-- Choose --</option>
              <option value="30-59 days">30 - 59 days disabled</option>
              <option value="60+ days">60+ days disabled</option>
            </select>
            {!formData.disability_range && (
              <p style={{ color: 'red', fontSize: '12px' }}>Please select the disability period before filling the rest.</p>
            )}
          </div>
        )}

        {showMainFields() && (
          <>
            <div style={{ marginBottom: '10px' }}>
              <label>Status Detail:</label>
              <input name="call_status_detail" value={formData.call_status_detail} onChange={handleChange} style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Package Type:</label>
              <input name="package_type" value={formData.package_type} onChange={handleChange} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Service Status:</label>
              <input name="service_status" value={formData.service_status} onChange={handleChange} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Call Outcome:</label>
              <select name="call_outcome" value={formData.call_outcome} onChange={handleChange}>
                <option value="">Select</option>
                <option>Answer</option>
                <option>Did not answer</option>
                <option>Busy</option>
                <option>Unreachable</option>
              </select>
            </div>

            {(formData.call_type === 'Winback' || formData.call_type === 'Payment Reminder') && (
              <>
                <div style={{ marginBottom: '10px' }}>
                  <label>Response Outcome:</label>
                  <select name="response_outcome" value={formData.response_outcome} onChange={handleChange}>
                    <option value="">Select</option>
                    <option>Paid</option>
                    <option>Promise to pay</option>
                    <option>Travel</option>
                    <option>Not interested</option>
                    <option>To collect equipment</option>
                    <option>No longer using our service</option>
                    <option>Other</option>
                  </select>
                </div>
                {formData.response_outcome === 'Other' && (
                  <div style={{ marginBottom: '10px' }}>
                    <label>Please specify:</label>
                    <input name="other_reason" value={formData.other_reason} onChange={handleChange} style={{ width: '100%' }} placeholder="Enter details..." />
                  </div>
                )}
              </>
            )}

            <div style={{ marginBottom: '10px' }}>
              <label>Agent Comment:</label>
              <textarea name="agent_comment" value={formData.agent_comment} onChange={handleChange} rows="3" style={{ width: '100%' }} />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label>
                <input type="checkbox" name="invoice_requested" checked={formData.invoice_requested} onChange={handleChange} />
                Request Invoice/Receipt
              </label>
            </div>
          </>
        )}

        <button type="submit" disabled={loading || (formData.call_type === 'Winback' && !formData.disability_range)}>
          {loading ? 'Saving...' : 'Save Call'}
        </button>
      </form>
    </div>
  );
}