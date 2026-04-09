'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient';

type Vehicle = {
  id: string;
  tag: string;
  plate: string;
  name: string;
  status: string;
  created_at?: string;
};

type AccessRow = {
  id: string;
  created_at?: string;
  tag: string;
  plate: string;
  name: string;
  action: string;
  result: string;
  operator_name?: string | null;
};

const MODES = ['Entrada', 'Saída'] as const;
type Mode = (typeof MODES)[number];

export default function Page() {
  const [mode, setMode] = useState<Mode>('Entrada');
  const [tagInput, setTagInput] = useState('');
  const [plateInput, setPlateInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [accesses, setAccesses] = useState<AccessRow[]>([]);
  const [allowed, setAllowed] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [connected, setConnected] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('Acesso liberado');
  const [dialogBody, setDialogBody] = useState('');
  const [dialogType, setDialogType] = useState<'Autorizado' | 'Bloqueado' | 'Não cadastrado'>('Autorizado');
  const [scanMsg, setScanMsg] = useState('Abra a câmera para ler um QR Code.');
  const [cameraHint, setCameraHint] = useState('Clique em “Iniciar câmera” para ler o QR Code.');
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [operatorName, setOperatorName] = useState('Operador');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('Sua Empresa');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    setCompanyName(process.env.NEXT_PUBLIC_COMPANY_NAME || 'Sua Empresa');
    const init = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setAuthReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      setSignedIn(Boolean(session));
      setAuthReady(true);
      setOperatorName(session?.user.email?.split('@')[0] || 'Operador');
      if (session) {
        await Promise.all([loadVehicles(), loadAccesses()]);
      }
    };
    init();
  }, []);

  async function loadVehicles() {
    if (!supabase) return;
    const { data } = await supabase.from('vehicles').select('*').order('created_at', { ascending: false });
    setVehicles((data as Vehicle[]) || []);
  }

  async function loadAccesses() {
    if (!supabase) return;
    const { data } = await supabase.from('access_logs').select('*').order('created_at', { ascending: false }).limit(12);
    const rows = (data as AccessRow[]) || [];
    setAccesses(rows);
    setAllowed(rows.filter((r) => r.result === 'Autorizado').length);
    setBlocked(rows.filter((r) => r.result !== 'Autorizado').length);
  }

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        !q ||
        v.tag.toLowerCase().includes(q) ||
        v.plate.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        v.status.toLowerCase().includes(q)
    );
  }, [search, vehicles]);

  function normalize(value: string) {
    return String(value || '').trim().toUpperCase();
  }

  function openDialog(type: 'Autorizado' | 'Bloqueado' | 'Não cadastrado', title: string, body: string) {
    setDialogType(type);
    setDialogTitle(title);
    setDialogBody(body);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  async function addLog(result: string, vehicle: Vehicle | null, tag: string, action: Mode) {
    if (!supabase) return;
    await supabase.from('access_logs').insert({
      tag,
      plate: vehicle?.plate || '-',
      name: vehicle?.name || 'Não cadastrado',
      action,
      result,
      operator_name: operatorName,
    });
    await loadAccesses();
  }

  async function validate(tagValue?: string) {
    if (!isSupabaseConfigured || !supabase) {
      setScanMsg('Configure as variáveis do Supabase no projeto.');
      return;
    }

    const tag = normalize(tagValue || tagInput);
    const plate = normalize(plateInput);
    const name = nameInput.trim();

    if (!tag) {
      setScanMsg('Digite ou leia uma tag válida antes de validar.');
      return;
    }

    const { data } = await supabase.from('vehicles').select('*').eq('tag', tag).maybeSingle();
    const vehicle = (data as Vehicle | null) || null;

    if (!vehicle) {
      setScanMsg(`Tag ${tag} não cadastrada.`);
      await addLog('Não cadastrado', null, tag, mode);
      openDialog(
        'Não cadastrado',
        'Tag não encontrada',
        `<strong>Tag:</strong> ${tag}<br/><strong>Placa:</strong> ${plate || '-'}<br/><strong>Nome:</strong> ${name || 'Não informado'}<br/><strong>Resultado:</strong> não cadastrada no banco.`
      );
      return;
    }

    if (vehicle.status === 'Bloqueado') {
      setScanMsg(`Acesso bloqueado para ${vehicle.name}.`);
      await addLog('Bloqueado', vehicle, tag, mode);
      openDialog(
        'Bloqueado',
        'Acesso bloqueado',
        `<strong>Tag:</strong> ${vehicle.tag}<br/><strong>Veículo:</strong> ${vehicle.name}<br/><strong>Placa:</strong> ${vehicle.plate}<br/><strong>Motivo:</strong> credencial bloqueada.`
      );
      return;
    }

    setScanMsg(`${mode} autorizada para ${vehicle.name} (${vehicle.plate}).`);
    await addLog('Autorizado', vehicle, tag, mode);
    openDialog(
      'Autorizado',
      'Acesso liberado',
      `<strong>Modo:</strong> ${mode}<br/><strong>Tag:</strong> ${vehicle.tag}<br/><strong>Veículo:</strong> ${vehicle.name}<br/><strong>Placa:</strong> ${vehicle.plate}<br/><strong>Status:</strong> ${vehicle.status}<br/><strong>Observação:</strong> gravado no banco de dados.`
    );
    setTagInput('');
    setPlateInput('');
    setNameInput('');
  }

  async function saveVehicle() {
    if (!supabase) return;

    const tag = normalize(tagInput);
    const plate = normalize(plateInput);
    const name = nameInput.trim();

    if (!tag || !plate || !name) {
      setScanMsg('Preencha tag, placa e nome.');
      return;
    }

    const { error } = await supabase.from('vehicles').insert({
      tag,
      plate,
      name,
      status: 'Liberado',
    });

    if (error) {
      setScanMsg('Erro ao cadastrar veículo.');
      return;
    }

    setTagInput('');
    setPlateInput('');
    setNameInput('');
    setScanMsg(`Veículo ${name} cadastrado com sucesso.`);
    await loadVehicles();
  }

  async function toggleVehicleStatus(vehicle: Vehicle) {
    if (!supabase) return;
    const nextStatus = vehicle.status === 'Liberado' ? 'Bloqueado' : 'Liberado';
    await supabase.from('vehicles').update({ status: nextStatus }).eq('id', vehicle.id);
    await loadVehicles();
  }

  async function signIn() {
    if (!supabase) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setScanMsg('Falha no login. Verifique usuário e senha.');
      return;
    }
    setSignedIn(true);
    setOperatorName(data.session.user.email?.split('@')[0] || 'Operador');
    await Promise.all([loadVehicles(), loadAccesses()]);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedIn(false);
    setVehicles([]);
    setAccesses([]);
  }

  function setModeValue(next: Mode) {
    setMode(next);
    setScanMsg(`Modo ${next} ativo.`);
  }

  async function fillFromScan(rawText: string) {
    const value = String(rawText || '').trim();
    const tag = value.toUpperCase().includes('TAG-')
      ? (value.toUpperCase().match(/TAG-[A-Z0-9-]+/)?.[0] || value.toUpperCase())
      : value.toUpperCase();

    setTagInput(tag);
    const vehicle = vehicles.find((v) => normalize(v.tag) === normalize(tag));
    setPlateInput(vehicle?.plate || '');
    setNameInput(vehicle?.name || '');
    setScanMsg(`QR lido: ${tag}`);
    await validate(tag);
  }

  async function startScanner() {
    if (scanningRef.current) return;
    if (!window.isSecureContext) {
      setScanMsg('A câmera exige HTTPS ou localhost.');
      return;
    }
    try {
      const Html5QrcodeLib = (await import('html5-qrcode')).Html5Qrcode;
      const scanner = new Html5QrcodeLib('reader');
      scannerRef.current = scanner;
      scanningRef.current = true;
      setCameraHint('Aponte o QR Code para a câmera.');
      setScanMsg('Câmera iniciada. Posicione o QR dentro do quadro.');

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await stopScanner();
          await fillFromScan(decodedText);
        },
        () => {}
      );
    } catch {
      scanningRef.current = false;
      setScanMsg('Não foi possível abrir a câmera. Verifique permissões.');
    }
  }

  async function stopScanner() {
    if (scannerRef.current && scanningRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {}
    }
    scannerRef.current = null;
    scanningRef.current = false;
    setCameraHint('Clique em “Iniciar câmera” para ler o QR Code.');
  }

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authReady) {
    return (
      <div className="container">
        <div className="authWrap">
          <div className="authCard">
            <h2>Carregando sistema...</h2>
            <p className="sub">Preparando acesso.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="container">
        <div className="authWrap">
          <div className="authCard">
            <div className="brand">
              <div className="logo">P</div>
              <div>
                <h1>Controle de Acesso Corporativo</h1>
                <p>{companyName}</p>
              </div>
            </div>
            <h2 style={{ marginTop: 16 }}>Supabase não configurado</h2>
            <p className="sub">
              Configure <strong>NEXT_PUBLIC_SUPABASE_URL</strong> e <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> para ativar a versão empresarial.
            </p>
            <div className="banner">
              O projeto já está pronto para receber banco, login e histórico. Falta apenas informar as credenciais do Supabase.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="container">
        <div className="authWrap">
          <div className="authCard">
            <div className="brand">
              <div className="logo">P</div>
              <div>
                <h1>Controle de Acesso Corporativo</h1>
                <p>{companyName}</p>
              </div>
            </div>
            <h2 style={{ marginTop: 16 }}>Acesso do operador</h2>
            <p className="sub">Entre com o usuário cadastrado no Supabase para liberar a operação.</p>
            <div className="authGrid">
              <div className="field">
                <label>E-mail</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operador@empresa.com" />
              </div>
              <div className="field">
                <label>Senha</label>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="********" />
              </div>
              <button className="btn primary" onClick={signIn}>Entrar</button>
            </div>
            <div className="banner" style={{ marginTop: 16 }}>
              Essa tela usa autenticação real do Supabase.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="logo">P</div>
            <div>
              <h1>Controle de Acesso Corporativo</h1>
              <p>{companyName} • QR Code • banco online • operação em tempo real</p>
            </div>
          </div>
          <div className="status">
            <div className={`pill ${connected ? 'success' : ''}`}>{connected ? 'Leitor pronto' : 'Leitor desconectado'}</div>
            <div className="pill primary">Modo operacional: <strong>{mode}</strong></div>
            <div className="pill">Operador: <strong>{operatorName}</strong></div>
            <button className="btn ghost" onClick={signOut}>Sair</button>
          </div>
        </div>

        <div className="grid">
          <section className="card">
            <div className="head">
              <div>
                <h2>Leitura e validação</h2>
                <div className="sub">Abra a câmera, leia o QR Code e o sistema valida direto no banco.</div>
              </div>
              <div className="segment">
                <button className="btn success" onClick={() => setModeValue('Entrada')}>Entrada</button>
                <button className="btn danger" onClick={() => setModeValue('Saída')}>Saída</button>
              </div>
            </div>

            <div className="content">
              <div className="split">
                <div>
                  <div className="scanBox">
                    <div className="cameraFrame">
                      <div id="reader" />
                      <div className="cameraHint">{cameraHint}</div>
                    </div>
                    <div className="segment">
                      <button className="btn primary" onClick={startScanner}>Iniciar câmera</button>
                      <button className="btn ghost" onClick={stopScanner}>Parar câmera</button>
                    </div>
                    <div className="scanMsg">{scanMsg}</div>
                    <div className="tiny">O QR deve conter a tag cadastrada, por exemplo: TAG-001.</div>
                  </div>

                  <div className="stats">
                    <div className="stat"><div className="k">Veículos cadastrados</div><div className="v">{vehicles.length}</div></div>
                    <div className="stat"><div className="k">Liberações</div><div className="v">{allowed}</div></div>
                    <div className="stat"><div className="k">Bloqueios</div><div className="v">{blocked}</div></div>
                  </div>
                </div>

                <div className="form">
                  <div className="field"><label>Tag QR</label><input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Ex.: TAG-001" /></div>
                  <div className="field"><label>Placa</label><input value={plateInput} onChange={(e) => setPlateInput(e.target.value)} placeholder="Ex.: ABC1D23" /></div>
                  <div className="field"><label>Nome do colaborador</label><input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Ex.: João Silva" /></div>
                  <div className="segment">
                    <button className="btn primary" onClick={() => validate()}>Validar acesso</button>
                    <button className="btn ghost" onClick={() => { setTagInput('TAG-001'); setPlateInput('ABC1D23'); setNameInput('Mariana Lima'); }}>Preencher exemplo</button>
                  </div>
                  <div className="segment">
                    <button className="btn success" onClick={saveVehicle}>Cadastrar veículo</button>
                    <button className="btn ghost" onClick={() => setConnected((v) => !v)}>Conectar / Desconectar leitor</button>
                  </div>
                  <div className="banner">Versão empresarial com banco online, login e leitura real de QR Code.</div>
                </div>
              </div>
            </div>
          </section>

          <div className="rightGrid">
            <section className="card">
              <div className="head">
                <div>
                  <h2>Cadastro de veículos</h2>
                  <div className="sub">Buscar, adicionar e bloquear/desbloquear credenciais.</div>
                </div>
              </div>
              <div className="content">
                <div className="field"><label>Buscar</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por placa, tag ou nome" /></div>
                <div className="list">
                  {filteredVehicles.map((v) => (
                    <div className="item" key={v.id}>
                      <div>
                        <strong>{v.name}</strong>
                        <span>Tag: {v.tag} • Placa: {v.plate}</span>
                      </div>
                      <button className={`tag ${v.status === 'Liberado' ? 'ok' : 'bad'}`} onClick={() => toggleVehicleStatus(v)}>
                        {v.status}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card">
              <div className="head">
                <div>
                  <h2>Últimos acessos</h2>
                  <div className="sub">Histórico salvo e consultado pelo Supabase.</div>
                </div>
              </div>
              <div className="content">
                <div className="list">
                  {accesses.map((item, index) => (
                    <div className="item" key={`${item.id}-${index}`}>
                      <div>
                        <strong>{item.action} • {item.tag}</strong>
                        <span>{item.created_at ? new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'} • {item.plate} • {item.name}</span>
                      </div>
                      <div className={`tag ${item.result === 'Autorizado' ? 'ok' : item.result === 'Bloqueado' ? 'bad' : 'warn'}`}>
                        {item.result}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="banner">O QR Code abre a câmera no navegador com HTTPS. No Vercel isso já funciona.</div>
              </div>
            </section>
          </div>
        </div>

        <div className="footer">Controle de Acesso Corporativo • {companyName}</div>
      </div>

      <div className="dialog" style={{ display: dialogOpen ? 'flex' : 'none' }}>
        <div className="box">
          <div className="content">
            <div className="mini">{dialogType}</div>
            <h3>{dialogTitle}</h3>
            <div className="detail" dangerouslySetInnerHTML={{ __html: dialogBody }} />
          </div>
          <div className="actions">
            <button className="btn primary" onClick={closeDialog}>Fechar</button>
            <button className="btn ghost" onClick={() => { setModeValue(mode === 'Entrada' ? 'Saída' : 'Entrada'); closeDialog(); }}>
              Alternar modo
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
