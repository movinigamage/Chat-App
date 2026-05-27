import { useState } from "react";
import { SpinnerIcon } from "./Icons";
import { parsePhoneInput } from "../utils/phone";

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

export default function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [countryCode, setCountryCode] = useState("+61");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePhoneChange = (e) => {
    let val = e.target.value;
    
    const cc = countryCode;
    const ccDigits = cc.replace("+", "");
    
    if (val.startsWith(cc)) {
      val = val.substring(cc.length).trim();
    } else if (val.startsWith(ccDigits) && val.length > ccDigits.length + 5) {
      val = val.substring(ccDigits.length).trim();
    } else if (val.startsWith("+")) {
      val = val.substring(1).trim();
    }
    
    setPhone(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let cleanLocalPhone = phone.trim();
    if (cleanLocalPhone.startsWith("+")) {
      cleanLocalPhone = cleanLocalPhone.substring(1);
    }
    cleanLocalPhone = cleanLocalPhone.replace(/\D/g, "");
    
    const ccDigits = countryCode.replace("+", "");
    if (cleanLocalPhone.startsWith(ccDigits) && cleanLocalPhone.length > ccDigits.length + 5) {
      cleanLocalPhone = cleanLocalPhone.substring(ccDigits.length);
    }
    
    if (cleanLocalPhone.startsWith("0")) {
      cleanLocalPhone = cleanLocalPhone.substring(1);
    }

    if (!cleanLocalPhone) {
      setError("Phone number is required");
      return;
    }

    if (cleanLocalPhone.length < 7 || cleanLocalPhone.length > 11) {
      setError("Please enter a valid phone number (7 to 11 digits)");
      return;
    }

    const fullPhone = countryCode + cleanLocalPhone;
    const parsed = parsePhoneInput(fullPhone);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const cleanName = name.trim();
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setError("Password is required");
      return;
    }
    if (!isLogin && cleanPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setError("");
    setLoading(true);

    try {
      let data;
      if (isLogin) {
        data = await request("/api/users/login", {
          method: "POST",
          body: JSON.stringify({ phone: parsed.phone, password: cleanPassword })
        });
      } else {
        data = await request("/api/users/register", {
          method: "POST",
          body: JSON.stringify({
            phone: parsed.phone,
            name: cleanName || parsed.phone,
            password: cleanPassword
          })
        });
      }

      // Success
      localStorage.setItem("chat:selfPhone", data.user.phone);
      localStorage.setItem("chat:selfName", data.user.name || data.user.phone);
      localStorage.setItem("chat:authToken", data.token);
      onAuthSuccess({
        phone: data.user.phone,
        name: data.user.name || data.user.phone,
        token: data.token
      });
    } catch (err) {
      const message = err.message || "Authentication failed";
      setError(message);
      if (!isLogin && message.toLowerCase().includes("already exists")) {
        setIsLogin(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-container">
      <div className="auth-card">
        <header className="auth-header">
          <div className="logo-badge">💬</div>
          <h1>Real-Time Chat</h1>
          <p className="auth-subtitle">
            {isLogin ? "Welcome back! Connect instantly." : "Create an account to start chatting."}
          </p>
        </header>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${isLogin ? "active" : ""}`}
            onClick={() => {
              setIsLogin(true);
              setError("");
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab ${!isLogin ? "active" : ""}`}
            onClick={() => {
              setIsLogin(false);
              setError("");
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="auth-phone">Phone Number</label>
            <div className="phone-input-container">
              <select
                className="country-code-select"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                disabled={loading}
              >
                <option value="+94">🇱🇰 +94</option>
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+61">🇦🇺 +61</option>
                <option value="+65">🇸🇬 +65</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+974">🇶🇦 +974</option>
                <option value="+966">🇸🇦 +966</option>
                <option value="+1">🇨🇦 +1</option>
              </select>
              <input
                id="auth-phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="77 123 4567"
                required
                disabled={loading}
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="input-group slide-down">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
              required
              disabled={loading}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          {!isLogin && (
            <div className="input-group slide-down">
              <label htmlFor="auth-name">Display Name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                disabled={loading}
                autoComplete="name"
              />
            </div>
          )}

          {error && (
            <div className="auth-error-banner" role="alert">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading-content">
                <SpinnerIcon size={18} />
                Processing...
              </span>
            ) : isLogin ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
