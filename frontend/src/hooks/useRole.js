// frontend/src/hooks/useRole.js
// Role state lives in RoleProvider (context/RoleContext.jsx), so every
// component shares one wallet + role lookup.
import { useContext } from 'react';
import { RoleContext } from '../context/roleContextObject';

export { registrationMessage } from '../lib/roleRegistration';

export function useRole() {
  const value = useContext(RoleContext);
  if (!value) throw new Error('useRole must be used inside <RoleProvider>');
  return value;
}
