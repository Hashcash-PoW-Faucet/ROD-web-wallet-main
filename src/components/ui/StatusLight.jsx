import React, { useEffect, useState } from 'react';

const StatusLight = () => {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/status`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') setStatus('ok');
        else setStatus('error');
      })
      .catch(() => setStatus('error'));
  }, []);

  const color = status === 'ok' ? 'green' : status === 'error' ? 'red' : 'gray';
  const label = status === 'ok' ? 'Node online' : status === 'error' ? 'Node offline' : 'Loading...';

  return (
    <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.9em' }}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: color,
        marginRight: 6
      }} />
      <span style={{ color: 'white' }}>{label}</span>
    </div>
  );
};

export default StatusLight;
