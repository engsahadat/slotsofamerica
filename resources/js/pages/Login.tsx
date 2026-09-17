import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Legacy /login route — redirects to homepage where login modal handles auth.
 * Kept to avoid 404 for any bookmarked links.
 */
const Login = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  useEffect(() => {
    if (user && role) {
      navigate(role === "admin" || role === "manager" ? "/admin" : "/home", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [user, role, navigate]);

  return null;
};

export default Login;
