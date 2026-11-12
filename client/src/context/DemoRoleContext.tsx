import React, { createContext, useContext, useState, useEffect } from 'react';
import { DemoRole } from '@proofpay/shared';
import { fetchDemoUsers } from '../api/client';

export interface DemoUserAccount {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  title: string;
  avatarUrl?: string;
  paypalEmail?: string;
}

interface DemoRoleContextType {
  activeRole: DemoRole;
  setRole: (role: DemoRole) => void;
  currentUser: DemoUserAccount | null;
  allDemoUsers: DemoUserAccount[];
  isLoading: boolean;
  refreshUsers: () => Promise<void>;
}

const DemoRoleContext = createContext<DemoRoleContextType | undefined>(undefined);

export const DemoRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRoleState] = useState<DemoRole>(() => {
    // Only accept known demo roles from storage (UI selection only; not authentication).
    const stored = localStorage.getItem('proofpay_demo_role');
    return stored === 'CLIENT' || stored === 'FREELANCER' ? stored : 'CLIENT';
  });

  const [allDemoUsers, setAllDemoUsers] = useState<DemoUserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const users = await fetchDemoUsers();
      setAllDemoUsers(users);
    } catch (err) {
      console.warn('Could not load demo users from backend:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const setRole = (role: DemoRole) => {
    localStorage.setItem('proofpay_demo_role', role);
    setActiveRoleState(role);
  };

  const currentUser = allDemoUsers.find((u) => u.role === activeRole) || null;

  return (
    <DemoRoleContext.Provider
      value={{
        activeRole,
        setRole,
        currentUser,
        allDemoUsers,
        isLoading,
        refreshUsers: loadUsers,
      }}
    >
      {children}
    </DemoRoleContext.Provider>
  );
};

export function useDemoRole() {
  const context = useContext(DemoRoleContext);
  if (!context) {
    throw new Error('useDemoRole must be used within a DemoRoleProvider');
  }
  return context;
}
