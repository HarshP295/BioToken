// frontend/src/pages/VerifyToken.jsx
// Kept for backward compatibility. Lab verification uses /lab route.
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function VerifyToken() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id') || searchParams.get('verify');

  useEffect(() => {
    // Redirect to the proper lab verification console
    if (id) {
      navigate(`/lab?verify=${id}`, { replace: true });
    } else {
      navigate('/lab', { replace: true });
    }
  }, [id, navigate]);

  return null;
}