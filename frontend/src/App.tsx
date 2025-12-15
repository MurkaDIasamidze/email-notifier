import { Bell, CheckCircle, Mail, Plus, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">Email Notifier</h1>
            </div>
            <div className="flex items-center gap-2">
              {notificationPermission === 'granted' ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Notifications enabled</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm">Notifications disabled</span>
                </div>
              )}
              <button
                onClick={testNotification}
                className="ml-4 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm flex items-center gap-2"
              >
                <Bell className="w-4 h-4" />
                Test Notification
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Email Accounts</h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </button>
            </div>

            {showAddForm && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Host (e.g., pop.gmail.com)"
                    value={formData.host}
                    onChange={e => setFormData({...formData, host: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      placeholder="Port"
                      value={formData.port}
                      onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <select
                      value={formData.protocol}
                      onChange={e => setFormData({...formData, protocol: e.target.value as 'POP3' | 'IMAP'})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="POP3">POP3</option>
                      <option value="IMAP">IMAP</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addAccount}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {accounts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No accounts added yet</p>
              ) : (
                accounts.map(account => (
                  <div
                    key={account.id}
                    className={`p-4 border rounded-lg ${account.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="w-4 h-4 text-gray-600" />
                          <span className="font-medium text-gray-800">{account.email}</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {account.host}:{account.port} ({account.protocol})
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleAccount(account)}
                          className={`px-3 py-1 rounded text-sm ${account.isActive ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-700'}`}
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </button>
                        <button
                          onClick={() => account.id && deleteAccount(account.id)}
                          className="text-red-600 hover:bg-red-50 p-1 rounded"
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

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Notifications</h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No notifications yet</p>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Bell className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-800 truncate">{notif.subject}</h3>
                        <p className="text-sm text-gray-600 truncate">From: {notif.from}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          To: {notif.accountEmail} • {new Date(notif.receivedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}