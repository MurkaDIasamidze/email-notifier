import React, { useState, useEffect } from 'react';
import { Bell, Mail, Plus, Trash2, CheckCircle, XCircle, Zap } from 'lucide-react';

interface EmailAccount {
  id?: number;
  email: string;
  password: string;
  host: string;
  port: number;
  protocol: 'POP3' | 'IMAP';
  isActive: boolean;
}

interface EmailNotification {
  id: number;
  from: string;
  subject: string;
  receivedAt: string;
  accountEmail: string;
}

export default function EmailNotifier() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  
  const [formData, setFormData] = useState<EmailAccount>({
    email: '',
    password: '',
    host: '',
    port: 995,
    protocol: 'POP3',
    isActive: true
  });

  const fetchAccounts = async () => {
    try {
      const res = await fetch('http://localhost:8081/api/accounts');
      const data = await res.json();
      setAccounts(data || []);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('http://localhost:8081/api/notifications?limit=50');
      const data = await res.json();
      
      if (data && data.length > 0) {
        const newNotifs = data.filter((n: EmailNotification) => 
          !notifications.find(existing => existing.id === n.id)
        );
        
        newNotifs.forEach((notif: EmailNotification) => {
          showDesktopNotification(notif);
        });
      }
      
      setNotifications(data || []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const showDesktopNotification = (notif: EmailNotification) => {
    if (notificationPermission === 'granted') {
      new Notification(`New Email: ${notif.subject}`, {
        body: `From: ${notif.from}\nAccount: ${notif.accountEmail}`,
        icon: '/mail-icon.png',
        tag: `email-${notif.id}`
      });
    }
  };

  const testNotification = () => {
    if (notificationPermission === 'granted') {
      new Notification('Test Notification', {
        body: 'Desktop notifications are working correctly!',
        icon: '/mail-icon.png',
      });
    } else if (notificationPermission === 'default') {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          new Notification('Test Notification', {
            body: 'Desktop notifications are now enabled!',
            icon: '/mail-icon.png',
          });
        }
      });
    } else {
      alert('Notifications are blocked. Please enable them in your browser settings.');
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
      });
    }
    
    let mounted = true;
    
    const loadData = async () => {
      if (mounted) {
        await fetchAccounts();
        await fetchNotifications();
      }
    };
    
    loadData();
    
    const interval = setInterval(() => {
      if (mounted) {
        fetchNotifications();
      }
    }, 10000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const addAccount = async () => {
    try {
      const res = await fetch('http://localhost:8081/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        await fetchAccounts();
        setShowAddForm(false);
        setFormData({
          email: '',
          password: '',
          host: '',
          port: 995,
          protocol: 'POP3',
          isActive: true
        });
      }
    } catch (err) {
      console.error('Failed to add account:', err);
    }
  };

  const deleteAccount = async (id: number) => {
    try {
      await fetch(`http://localhost:8081/api/accounts/${id}`, {
        method: 'DELETE'
      });
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to delete account:', err);
    }
  };

  const toggleAccount = async (account: EmailAccount) => {
    try {
      await fetch(`http://localhost:8081/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...account, isActive: !account.isActive })
      });
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to toggle account:', err);
    }
  };

  return (
    <div className="min-h-screen bg-black p-6 relative overflow-hidden">
      {/* Cyberpunk grid background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-900/20 via-black to-cyan-900/20 pointer-events-none" />
      <div className="fixed inset-0 opacity-20 pointer-events-none" 
           style={{
             backgroundImage: 'linear-gradient(rgba(0,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.1) 1px, transparent 1px)',
             backgroundSize: '50px 50px'
           }} />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-8 border-b border-cyan-500/30 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell className="w-10 h-10 text-cyan-400 animate-pulse" />
                <Zap className="w-4 h-4 text-yellow-400 absolute -top-1 -right-1" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-wider">
                  MAIL.SCANNER
                </h1>
                <p className="text-cyan-500/60 text-sm tracking-widest">NEURAL NETWORK v2.077</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {notificationPermission === 'granted' ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400 font-mono">ONLINE</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-red-400 font-mono">OFFLINE</span>
                </div>
              )}
              <button
                onClick={testNotification}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-mono text-sm rounded border border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/50 transition-all flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                TEST.ALERT
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email Accounts Section */}
          <div className="bg-black/40 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6 shadow-2xl shadow-cyan-500/10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-cyan-400 font-mono tracking-wider flex items-center gap-2">
                <Mail className="w-6 h-6" />
                ACCOUNTS
              </h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-mono text-sm rounded border border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
              >
                <Plus className="w-4 h-4" />
                ADD
              </button>
            </div>

            {showAddForm && (
              <div className="mb-6 p-6 bg-purple-900/20 border border-purple-500/30 rounded-lg backdrop-blur">
                <div className="space-y-4">
                  <input
                    type="email"
                    placeholder="EMAIL ADDRESS"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-3 bg-black/60 border border-cyan-500/50 rounded text-cyan-300 placeholder-cyan-700 focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-500/20 outline-none font-mono"
                  />
                  <input
                    type="password"
                    placeholder="PASSWORD"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full px-4 py-3 bg-black/60 border border-cyan-500/50 rounded text-cyan-300 placeholder-cyan-700 focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-500/20 outline-none font-mono"
                  />
                  <input
                    type="text"
                    placeholder="HOST (e.g., imap.gmail.com)"
                    value={formData.host}
                    onChange={e => setFormData({...formData, host: e.target.value})}
                    className="w-full px-4 py-3 bg-black/60 border border-cyan-500/50 rounded text-cyan-300 placeholder-cyan-700 focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-500/20 outline-none font-mono"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="number"
                      placeholder="PORT"
                      value={formData.port}
                      onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                      className="w-full px-4 py-3 bg-black/60 border border-cyan-500/50 rounded text-cyan-300 placeholder-cyan-700 focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-500/20 outline-none font-mono"
                    />
                    <select
                      value={formData.protocol}
                      onChange={e => setFormData({...formData, protocol: e.target.value as 'POP3' | 'IMAP'})}
                      className="w-full px-4 py-3 bg-black/60 border border-cyan-500/50 rounded text-cyan-300 focus:border-cyan-400 focus:shadow-lg focus:shadow-cyan-500/20 outline-none font-mono"
                    >
                      <option value="POP3">POP3</option>
                      <option value="IMAP">IMAP</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={addAccount}
                      className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded font-mono border border-green-400/50 hover:shadow-lg hover:shadow-green-500/50 transition-all"
                    >
                      CONNECT
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 bg-red-900/30 border border-red-500/50 text-red-400 py-3 rounded font-mono hover:bg-red-900/50 transition-all"
                    >
                      ABORT
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {accounts.length === 0 ? (
                <div className="text-center py-12 text-cyan-600/50 font-mono">
                  <p className="text-lg">NO ACCOUNTS DETECTED</p>
                  <p className="text-sm mt-2">INITIALIZE CONNECTION...</p>
                </div>
              ) : (
                accounts.map(account => (
                  <div
                    key={account.id}
                    className={`p-4 rounded-lg border backdrop-blur transition-all ${
                      account.isActive 
                        ? 'bg-green-900/20 border-green-500/40 shadow-lg shadow-green-500/10' 
                        : 'bg-gray-900/30 border-gray-500/30'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="w-4 h-4 text-cyan-400" />
                          <span className="font-mono text-cyan-300">{account.email}</span>
                        </div>
                        <p className="text-sm text-purple-400/70 font-mono">
                          {account.host}:{account.port} [{account.protocol}]
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleAccount(account)}
                          className={`px-3 py-1 rounded text-xs font-mono border transition-all ${
                            account.isActive 
                              ? 'bg-green-600/20 text-green-400 border-green-500/50' 
                              : 'bg-gray-700/30 text-gray-400 border-gray-500/50'
                          }`}
                        >
                          {account.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </button>
                        <button
                          onClick={() => account.id && deleteAccount(account.id)}
                          className="text-red-400 hover:bg-red-900/30 p-2 rounded border border-red-500/30 hover:border-red-500/50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Notifications Section */}
          <div className="bg-black/40 backdrop-blur-sm border border-pink-500/30 rounded-lg p-6 shadow-2xl shadow-pink-500/10">
            <h2 className="text-2xl font-bold text-pink-400 font-mono tracking-wider mb-6 flex items-center gap-2">
              <Bell className="w-6 h-6" />
              INCOMING.TRANSMISSIONS
            </h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-pink-600/50 font-mono">
                  <p className="text-lg">NO TRANSMISSIONS</p>
                  <p className="text-sm mt-2">AWAITING SIGNAL...</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className="p-4 bg-blue-900/10 border border-blue-500/30 rounded-lg backdrop-blur hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-mono text-cyan-300 truncate mb-1">{notif.subject}</h3>
                        <p className="text-sm text-purple-400/80 truncate font-mono">FROM: {notif.from}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-pink-500/60 font-mono">TO: {notif.accountEmail}</span>
                          <span className="text-xs text-cyan-500/40 font-mono">
                            {new Date(notif.receivedAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #06b6d4, #ec4899);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #0891b2, #db2777);
        }
      `}</style>
    </div>
  );
}