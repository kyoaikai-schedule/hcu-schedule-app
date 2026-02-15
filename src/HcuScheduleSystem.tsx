import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Settings, Moon, Sun, Clock, RefreshCw, AlertCircle, CheckCircle, Plus, Trash2, LogOut, Lock, Download, Upload, Edit2, Save, X, Eye, Users, FileSpreadsheet, Activity, Maximize2, Minimize2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from './lib/supabase';

// ============================================
// 定数定義
// ============================================

const POSITIONS = {
  師長: { name: '師長', color: 'bg-rose-100 text-rose-700 border-rose-200', priority: 1 },
  主任: { name: '主任', color: 'bg-amber-100 text-amber-700 border-amber-200', priority: 2 },
  副主任: { name: '副主任', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', priority: 3 },
  一般: { name: '一般', color: 'bg-slate-100 text-slate-600 border-slate-200', priority: 4 }
};

const SHIFT_TYPES = {
  日: { name: '日勤', hours: 7.5, color: 'bg-blue-100 text-blue-700' },
  夜: { name: '夜勤', hours: 14.5, color: 'bg-purple-100 text-purple-700' },
  明: { name: '夜明', hours: 0, color: 'bg-pink-100 text-pink-700' },
  休: { name: '公休', hours: 0, color: 'bg-gray-100 text-gray-600' },
  有: { name: '有休', hours: 0, color: 'bg-emerald-100 text-emerald-700' }
};

// Supabase DB操作関数
const fetchNursesFromDB = async () => {
  const { data, error } = await supabase.from('hcu_nurses').select('*').order('id');
  if (error) throw error;
  return data || [];
};
const upsertNurseToDB = async (nurse: any) => {
  const { error } = await supabase.from('hcu_nurses').upsert(nurse, { onConflict: 'id' });
  if (error) throw error;
};
const deleteNurseFromDB = async (id: number) => {
  const { error } = await supabase.from('hcu_nurses').delete().eq('id', id);
  if (error) throw error;
};
const fetchRequestsFromDB = async (year: number, month: number) => {
  const { data, error } = await supabase.from('hcu_requests').select('*').eq('year', year).eq('month', month);
  if (error) throw error;
  return data || [];
};
const upsertRequestToDB = async (nurseId: number, year: number, month: number, day: number, shiftType: string) => {
  const { error } = await supabase.from('hcu_requests').upsert(
    { nurse_id: nurseId, year, month, day, shift_type: shiftType },
    { onConflict: 'nurse_id,year,month,day' }
  );
  if (error) throw error;
};
const deleteRequestFromDB = async (nurseId: number, year: number, month: number, day: number) => {
  const { error } = await supabase.from('hcu_requests').delete()
    .eq('nurse_id', nurseId).eq('year', year).eq('month', month).eq('day', day);
  if (error) throw error;
};
const fetchSchedulesFromDB = async (year: number, month: number) => {
  const { data, error } = await supabase.from('hcu_schedules').select('*').eq('year', year).eq('month', month);
  if (error) throw error;
  return data || [];
};
const saveSchedulesToDB = async (year: number, month: number, scheduleData: Record<number, (string | null)[]>) => {
  await supabase.from('hcu_schedules').delete().eq('year', year).eq('month', month);
  const rows: any[] = [];
  Object.entries(scheduleData).forEach(([nurseId, shifts]) => {
    (shifts as (string | null)[]).forEach((shift, dayIndex) => {
      if (shift) rows.push({ nurse_id: parseInt(nurseId), year, month, day: dayIndex + 1, shift });
    });
  });
  if (rows.length > 0) {
    const { error } = await supabase.from('hcu_schedules').insert(rows);
    if (error) throw error;
  }
};
const updateScheduleCellInDB = async (nurseId: number, year: number, month: number, day: number, shift: string | null) => {
  if (shift) {
    await supabase.from('hcu_schedules').upsert(
      { nurse_id: nurseId, year, month, day, shift },
      { onConflict: 'nurse_id,year,month,day' }
    );
  } else {
    await supabase.from('hcu_schedules').delete()
      .eq('nurse_id', nurseId).eq('year', year).eq('month', month).eq('day', day);
  }
};
const fetchSettingFromDB = async (key: string) => {
  const { data, error } = await supabase.from('hcu_settings').select('value').eq('key', key).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.value || null;
};
const saveSettingToDB = async (key: string, value: string) => {
  await supabase.from('hcu_settings').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
};

// ============================================
// ユーティリティ関数
// ============================================

// 固定アクセスコード生成（ID + 名前から常に同じコードを生成）
const generateFixedAccessCode = (id, name) => {
  let hash = 0;
  const str = `${id}-${name}-hcu2025`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const code = Math.abs(hash % 900000) + 100000;
  return String(code);
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const getDayOfWeek = (year, month, day) => {
  const d = new Date(year, month, day);
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
};

const isWeekend = (year, month, day) => {
  const d = new Date(year, month, day);
  return d.getDay() === 0 || d.getDay() === 6;
};

// ============================================
// メインコンポーネント
// ============================================

const HcuScheduleSystem = () => {
  // システムモード: 'select' | 'admin' | 'dashboard' | 'adminSchedule' | 'staff'
  const [systemMode, setSystemMode] = useState('select');
  
  // ダッシュボード用
  const [dashboardYear, setDashboardYear] = useState(new Date().getFullYear());
  
  // 管理者認証
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  
  // 職員認証
  const [staffNurseId, setStaffNurseId] = useState(null);
  const [staffCode, setStaffCode] = useState('');
  const [staffError, setStaffError] = useState('');
  
  // ローディング状態
  const [isLoading, setIsLoading] = useState(true);

  // 対象年月
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth());
  
  // 看護師データ（Supabase永続化）
  const [nurses, setNurses] = useState<any[]>([]);
  
  // 休み希望データ（Supabase永続化）
  const [requests, setRequests] = useState<Record<string, any>>({});
  
  // 勤務表データ
  const [schedule, setSchedule] = useState<any>(null);
  // 「夜」選択時に翌日を自動「明」にした際の元の値を保存
  const [autoAkeBackup, setAutoAkeBackup] = useState<Record<string, string | null>>({});
  
  // UI状態
  const [showSettings, setShowSettings] = useState(false);
  const [showRequestReview, setShowRequestReview] = useState(false);
  // 管理者編集前のオリジナルリクエストを追跡
  const [originalRequests, setOriginalRequests] = useState<Record<string, any>>({});
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [editingNurse, setEditingNurse] = useState(null);
  const [showAddNurse, setShowAddNurse] = useState(false);
  const [newNurseData, setNewNurseData] = useState({ name: '', position: '一般' });
  const [generating, setGenerating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // 削除確認用
  const [showGenerateConfig, setShowGenerateConfig] = useState(false); // 生成設定モーダル
  const [isMaximized, setIsMaximized] = useState(false); // 勤務表最大化
  const [showDeadlineSettings, setShowDeadlineSettings] = useState(false); // 締め切り設定モーダル
  const [showPasswordChange, setShowPasswordChange] = useState(false); // パスワード変更モーダル
  
  // 提出期限設定
  const [requestDeadline, setRequestDeadline] = useState({ day: 14, hour: 11, minute: 59 });
  
  // 勤務表生成設定
  const [generateConfig, setGenerateConfig] = useState({
    nightShiftPattern: [2, 3], // 週ごとの夜勤人数パターン（交互）
    startWithThree: false, // 第1週を2人から開始
    maxNightShifts: 6, // 個人の最大夜勤回数
    minDaysOff: 8, // 最小休日数
    maxConsecutiveDays: 5, // 最大連続勤務日数
    // 日勤者数設定
    weekdayDayStaff: 7, // 平日の日勤者数
    weekendDayStaff: 5, // 土日の日勤者数
    yearEndDayStaff: 4, // 年末（12/30-31）の日勤者数
    newYearDayStaff: 4  // 年始（1/1-3）の日勤者数
  });
  
  // 前月データ関連（確定済み）
  const [previousMonthData, setPreviousMonthData] = useState<any>(null);
  const [prevMonthConstraints, setPrevMonthConstraints] = useState<any>({});
  
  // 職員別シフト設定: { nurseId: { maxNightShifts: number, noNightShift: boolean, noDayShift: boolean } }
  const [nurseShiftPrefs, setNurseShiftPrefs] = useState<Record<number, { maxNightShifts: number; noNightShift: boolean; noDayShift: boolean }>>({});
  const [showNurseShiftPrefs, setShowNurseShiftPrefs] = useState(false);
  
  // 前月データ関連（プレビュー用）
  const [showPrevMonthImport, setShowPrevMonthImport] = useState(false);
  const [showPrevMonthReview, setShowPrevMonthReview] = useState(false);
  const [prevMonthRawData, setPrevMonthRawData] = useState([]); // Excelから読み込んだ生データ [{name, shifts}]
  const [prevMonthMapping, setPrevMonthMapping] = useState({}); // { nurseId: excelRowIndex } マッピング
  
  // Excel読み込み用
  const [excelData, setExcelData] = useState(null);
  const [excelPreview, setExcelPreview] = useState([]);
  const [importConfig, setImportConfig] = useState({
    startRow: 2,
    endRow: 30,
    nameColumn: 'C',
    positionColumn: 'D'
  });

  // Supabaseからデータ読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const dbNurses = await fetchNursesFromDB();
        if (dbNurses.length > 0) {
          setNurses(dbNurses);
        }
        const dbRequests = await fetchRequestsFromDB(targetYear, targetMonth);
        const reqMap: Record<string, any> = {};
        dbRequests.forEach((r: any) => {
          const monthKey = `${r.year}-${r.month}`;
          if (!reqMap[monthKey]) reqMap[monthKey] = {};
          if (!reqMap[monthKey][r.nurse_id]) reqMap[monthKey][r.nurse_id] = {};
          reqMap[monthKey][r.nurse_id][r.day] = r.shift_type;
        });
        setRequests(reqMap);

        const dbSchedules = await fetchSchedulesFromDB(targetYear, targetMonth);
        if (dbSchedules.length > 0) {
          const days = getDaysInMonth(targetYear, targetMonth);
          const schedData: Record<number, (string | null)[]> = {};
          dbSchedules.forEach((s: any) => {
            if (!schedData[s.nurse_id]) schedData[s.nurse_id] = new Array(days).fill(null);
            schedData[s.nurse_id][s.day - 1] = s.shift;
          });
          setSchedule({ month: `${targetYear}-${targetMonth}`, data: schedData });
        } else {
          setSchedule(null);
        }

        // 前月データの読み込み（月別キーで保存）
        const pmKey = `prevMonth-${targetYear}-${targetMonth}`;
        const savedPrevData = await fetchSettingFromDB(pmKey);
        if (savedPrevData) {
          try {
            const parsed = JSON.parse(savedPrevData);
            const pmData = parsed.data || null;
            setPreviousMonthData(pmData);
            // 制約は常にデータから再計算（旧0ベースデータとの互換性確保）
            if (pmData) {
              const reCalc = {};
              Object.entries(pmData).forEach(([nurseId, shifts]: [string, any]) => {
                if (!shifts || shifts.length === 0) return;
                const last = shifts[shifts.length - 1];
                const sec = shifts.length > 1 ? shifts[shifts.length - 2] : '';
                const third = shifts.length > 2 ? shifts[shifts.length - 3] : '';
                reCalc[nurseId] = {};
                if (last === '夜') {
                  reCalc[nurseId][1] = '明'; reCalc[nurseId][2] = '休';
                  if (third === '夜' && sec === '明') reCalc[nurseId][3] = '休';
                } else if (last === '明') {
                  reCalc[nurseId][1] = '休';
                  if (sec === '夜' && shifts.length >= 4 && shifts[shifts.length - 4] === '夜' && shifts[shifts.length - 3] === '明') {
                    reCalc[nurseId][2] = '休';
                  }
                }
                let consec = 0;
                for (let i = shifts.length - 1; i >= 0; i--) {
                  const s = shifts[i];
                  if (s && s !== '休' && s !== '有' && s !== '明') consec++; else break;
                }
                if (consec >= 4 && !reCalc[nurseId][1]) reCalc[nurseId][1] = '休';
              });
              setPrevMonthConstraints(reCalc);
            } else {
              setPrevMonthConstraints({});
            }
          } catch(e) { console.error('前月データ解析エラー:', e); }
        }

        // 職員別シフト設定の読み込み
        const savedPrefs = await fetchSettingFromDB('nurseShiftPrefs');
        if (savedPrefs) {
          try {
            setNurseShiftPrefs(JSON.parse(savedPrefs));
          } catch(e) { console.error('職員設定解析エラー:', e); }
        }
      } catch (error: any) {
        console.error('データ読み込みエラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [targetYear, targetMonth]);

  // DBから最新のリクエストデータを再読み込み
  const reloadRequestsFromDB = async () => {
    try {
      const dbRequests = await fetchRequestsFromDB(targetYear, targetMonth);
      const reqMap: Record<string, any> = {};
      dbRequests.forEach((r: any) => {
        const monthKey = `${r.year}-${r.month}`;
        if (!reqMap[monthKey]) reqMap[monthKey] = {};
        if (!reqMap[monthKey][r.nurse_id]) reqMap[monthKey][r.nurse_id] = {};
        reqMap[monthKey][r.nurse_id][r.day] = r.shift_type;
      });
      setRequests(reqMap);
      return reqMap;
    } catch (e) {
      console.error('リクエスト再読み込みエラー:', e);
      return null;
    }
  };

  // nursesの変更をSupabaseに保存
  const saveNurseToDB = async (nurseData: any) => {
    try { await upsertNurseToDB(nurseData); } catch (e) { console.error('保存エラー:', e); }
  };

  // requestsの変更をSupabaseに保存
  const saveRequestToDB = async (nurseId: number, year: number, month: number, day: number, shiftType: string | null) => {
    if (shiftType) {
      await upsertRequestToDB(nurseId, year, month, day, shiftType);
    } else {
      await deleteRequestFromDB(nurseId, year, month, day);
    }
  };

  // 計算値
  const activeNurses = useMemo(() => 
    nurses.filter(n => n.active).sort((a, b) => 
      (POSITIONS[a.position]?.priority || 99) - (POSITIONS[b.position]?.priority || 99)
    ), [nurses]);
  
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  
  // 各看護師にアクセスコードを付与
  const nursesWithCodes = useMemo(() => 
    activeNurses.map(n => ({
      ...n,
      accessCode: generateFixedAccessCode(n.id, n.name)
    })), [activeNurses]);

  // ============================================
  // 管理者機能
  // ============================================

  const handleAdminLogin = () => {
    if (adminPassword === 'admin123') {
      setIsAdminAuth(true);
      setAdminError('');
      setSystemMode('dashboard');
    } else {
      setAdminError('パスワードが正しくありません');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuth(false);
    setAdminPassword('');
    setSystemMode('select');
  };

  const addNurse = () => {
    if (!newNurseData.name.trim()) {
      alert('氏名を入力してください');
      return;
    }
    const newId = Math.max(...nurses.map((n: any) => n.id), 0) + 1;
    const newNurse = {
      id: newId,
      name: newNurseData.name.trim(),
      position: newNurseData.position,
      active: true
    };
    setNurses([...nurses, newNurse]);
    upsertNurseToDB(newNurse).catch(e => console.error('DB保存エラー:', e));
    setShowAddNurse(false);
    setNewNurseData({ name: '', position: '一般' });
  };

  const updateNurse = (id: any, updates: any) => {
    const updated = { ...nurses.find((n: any) => n.id === id), ...updates };
    setNurses(nurses.map((n: any) => n.id === id ? updated : n));
    upsertNurseToDB(updated).catch(e => console.error('DB保存エラー:', e));
  };

  const deleteNurse = (id: any) => {
    if (activeNurses.length <= 1) {
      alert('最低1名の職員が必要です');
      return;
    }
    setNurses(nurses.filter((n: any) => n.id !== id));
    deleteNurseFromDB(id).catch(e => console.error('DB削除エラー:', e));
  };

  // Excel読み込み
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        
        setExcelData(jsonData);
        updateExcelPreview(jsonData, importConfig);
        setShowExcelImport(true);
      } catch (error) {
        alert('Excelファイルの読み込みに失敗しました: ' + error.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const columnToIndex = (col) => {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
  };

  const updateExcelPreview = (data, config) => {
    if (!data) return;
    
    const preview = [];
    const nameColIndex = columnToIndex(config.nameColumn);
    const posColIndex = columnToIndex(config.positionColumn);
    
    for (let i = config.startRow - 1; i < Math.min(config.endRow, data.length); i++) {
      const row = data[i];
      if (row && row[nameColIndex]) {
        const name = String(row[nameColIndex]).trim();
        if (name) {
          preview.push({
            row: i + 1,
            name: name,
            position: row[posColIndex] ? String(row[posColIndex]).trim() : '一般'
          });
        }
      }
    }
    
    setExcelPreview(preview);
  };

  const applyExcelImport = () => {
    if (excelPreview.length === 0) {
      alert('読み込むデータがありません');
      return;
    }

    const newNurses = excelPreview.map((item, index) => {
      let position = '一般';
      const posStr = (item.position || '').replace(/\s+/g, '');
      
      if (posStr.includes('師長')) position = '師長';
      else if (posStr.includes('主任') && !posStr.includes('副')) position = '主任';
      else if (posStr.includes('副主任') || (posStr.includes('副') && posStr.includes('主任'))) position = '副主任';
      
      return {
        id: index + 1,
        name: item.name,
        active: true,
        position: position
      };
    });

    setNurses(newNurses);
    // DB一括保存
    (async () => {
      try {
        await supabase.from('hcu_nurses').delete().neq('id', 0);
        if (newNurses.length > 0) {
          await supabase.from('hcu_nurses').insert(newNurses);
        }
      } catch (e) { console.error('DB保存エラー:', e); }
    })();
    setShowExcelImport(false);
    setExcelData(null);
    setExcelPreview([]);
    alert(`✅ ${newNurses.length}名の職員情報を読み込みました`);
  };

  // ============================================
  // 前月勤務表読み込み機能
  // ============================================
  
  // 前月勤務表のExcel読み込み
  const handlePrevMonthUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // 前月末7日分のデータを抽出（配列形式）
        const rawData = extractPreviousMonthDataAsArray(jsonData);
        
        if (rawData.length > 0) {
          setPrevMonthRawData(rawData);
          
          // 自動マッピングを試みる
          const autoMapping = createAutoMapping(rawData);
          setPrevMonthMapping(autoMapping);
          
          setShowPrevMonthImport(false);
          setShowPrevMonthReview(true);
        } else {
          alert('前月データを抽出できませんでした。フォーマットを確認してください。');
        }
      } catch (error) {
        console.error('前月データ読み込みエラー:', error);
        alert('Excelファイルの読み込みに失敗しました');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // 自動マッピングを作成（名前の類似度で紐付け）
  const createAutoMapping = (rawData) => {
    const mapping = {};
    
    activeNurses.forEach((nurse, nurseIndex) => {
      // まず名前でマッチを試みる
      let bestMatch = -1;
      let bestScore = 0;
      
      rawData.forEach((row, rowIndex) => {
        const score = calculateNameSimilarity(nurse.name, row.name);
        if (score > bestScore && score > 0.3) { // 30%以上の類似度
          bestScore = score;
          bestMatch = rowIndex;
        }
      });
      
      // マッチが見つからない場合、行番号順で割り当て
      if (bestMatch === -1 && nurseIndex < rawData.length) {
        bestMatch = nurseIndex;
      }
      
      if (bestMatch !== -1) {
        mapping[nurse.id] = bestMatch;
      }
    });
    
    return mapping;
  };

  // 名前の類似度を計算（簡易版）
  const calculateNameSimilarity = (name1, name2) => {
    if (!name1 || !name2) return 0;
    
    const n1 = normalizeName(name1).replace(/\s/g, '');
    const n2 = normalizeName(name2).replace(/\s/g, '');
    
    if (n1 === n2) return 1;
    
    // 部分一致
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;
    
    // 文字の一致率
    const chars1 = new Set(n1);
    const chars2 = new Set(n2);
    const intersection = [...chars1].filter(c => chars2.has(c)).length;
    const union = new Set([...chars1, ...chars2]).size;
    
    return intersection / union;
  };

  // マッピングを変更
  const updateMapping = (nurseId, excelRowIndex) => {
    setPrevMonthMapping(prev => ({
      ...prev,
      [nurseId]: excelRowIndex === '' ? undefined : parseInt(excelRowIndex)
    }));
  };

  // 前月データを確定
  const confirmPreviousMonthData = () => {
    if (prevMonthRawData.length === 0) return;
    
    // マッピングに基づいてデータを作成
    const confirmedData = {};
    activeNurses.forEach(nurse => {
      const rowIndex = prevMonthMapping[nurse.id];
      if (rowIndex !== undefined && prevMonthRawData[rowIndex]) {
        confirmedData[nurse.id] = prevMonthRawData[rowIndex].shifts;
      }
    });
    
    setPreviousMonthData(confirmedData);
    
    // 制約を計算
    const constraints = calculateConstraintsFromData(confirmedData);
    setPrevMonthConstraints(constraints);

    // Supabaseに保存（月別キー）
    const pmKey = `prevMonth-${targetYear}-${targetMonth}`;
    saveSettingToDB(pmKey, JSON.stringify({ data: confirmedData, constraints }))
      .catch(e => console.error('前月データ保存エラー:', e));

    // ★★★ 前月データ反映後、既存の勤務表を消去（希望＋前月データから再生成させる）★★★
    setSchedule(null);
    (async () => {
      try {
        await supabase.from('hcu_schedules').delete()
          .eq('year', targetYear).eq('month', targetMonth);
        console.log('前月データ反映のため勤務表を消去しました');
      } catch (e) { console.error('勤務表消去エラー:', e); }
    })();
    
    // プレビュー状態をクリア
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    setShowPrevMonthReview(false);
    
    alert('✅ 前月データを確定しました。\n既存の勤務表は消去されました。\n希望一覧・勤務表画面に前月制約が反映されています。\n「自動生成」で新しい勤務表を作成してください。');
  };

  // プレビューをキャンセル
  const cancelPreviousMonthPreview = () => {
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    setShowPrevMonthReview(false);
  };

  // 前月末7日分のデータを配列として抽出
  const extractPreviousMonthDataAsArray = (jsonData) => {
    const result = [];
    
    if (jsonData.length < 2) return result;
    
    // ヘッダー行と列構造を検出
    let headerRowIndex = 0;
    let nameColIndex = 1; // デフォルトは列B
    let dataStartCol = 2; // デフォルトは列C
    let dataEndCol = -1;
    
    // 最初の10行からヘッダー行を探す
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || row.length < 3) continue;
      
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').trim().toLowerCase();
        
        // 氏名列を探す
        if (cell === 'name' || cell.includes('氏名') || cell.includes('名前') || 
            cell === 'スタッフ' || cell === '看護師' || cell === '職員') {
          nameColIndex = j;
          headerRowIndex = i;
        }
        
        // 日付列を探す（Excelシリアル値）
        const numVal = Number(row[j]);
        if (!isNaN(numVal) && numVal > 43000 && numVal < 50000) {
          if (dataStartCol === 2 || j < dataStartCol) dataStartCol = j;
          dataEndCol = Math.max(dataEndCol, j);
        }
      }
    }
    
    if (dataEndCol === -1) {
      dataEndCol = jsonData[0] ? jsonData[0].length - 1 : 31;
    }
    
    // データ行を処理
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row) continue;
      
      const name = String(row[nameColIndex] || '').trim();
      if (!name || name.includes('合計') || name.includes('計') || name === 'ID' || name === 'Name') continue;
      
      // 最後の7日分を取得
      const totalDays = dataEndCol - dataStartCol + 1;
      const startDay = Math.max(0, totalDays - 7);
      const shifts = [];
      
      for (let d = startDay; d < totalDays; d++) {
        const colIndex = dataStartCol + d;
        const shift = String(row[colIndex] || '').trim();
        shifts.push(normalizeShift(shift));
      }
      
      if (shifts.some(s => s)) {
        result.push({ name, shifts, rowIndex: result.length });
      }
    }
    
    return result;
  };

  // 確定済みデータから制約を計算
  const calculateConstraintsFromData = (confirmedData) => {
    const constraints = {};
    
    activeNurses.forEach(nurse => {
      const shifts = confirmedData[nurse.id];
      if (!shifts || shifts.length === 0) return;
      
      const lastShift = shifts[shifts.length - 1];
      const secondLastShift = shifts.length > 1 ? shifts[shifts.length - 2] : '';
      const thirdLastShift = shifts.length > 2 ? shifts[shifts.length - 3] : '';
      
      constraints[nurse.id] = {};
      
      // 前月末が「夜勤」の場合 → 1日目=明, 2日目=休
      if (lastShift === '夜') {
        constraints[nurse.id][1] = '明';  // 1日目
        constraints[nurse.id][2] = '休';  // 2日目
        if (thirdLastShift === '夜' && secondLastShift === '明') {
          constraints[nurse.id][3] = '休';  // 3日目
        }
      }
      // 前月末が「夜勤明け」の場合 → 1日目=休
      else if (lastShift === '明') {
        constraints[nurse.id][1] = '休';  // 1日目
        if (secondLastShift === '夜') {
          if (shifts.length >= 4 && shifts[shifts.length - 4] === '夜' && shifts[shifts.length - 3] === '明') {
            constraints[nurse.id][2] = '休';  // 2日目
          }
        }
      }
      // 前月末が「休」の場合 → 制約なし（1日目は自由）
      // 前月末が「日勤」等で連続勤務が4日以上の場合 → 1日目=休
      
      // 連続勤務日数をチェック
      let consecutiveWork = 0;
      for (let i = shifts.length - 1; i >= 0; i--) {
        const s = shifts[i];
        if (s && s !== '休' && s !== '有' && s !== '明') {
          consecutiveWork++;
        } else {
          break;
        }
      }
      
      if (consecutiveWork >= 4 && !constraints[nurse.id][1]) {
        constraints[nurse.id][1] = '休';  // 1日目
      }
    });
    
    return constraints;
  };
  // 氏名を正規化（スペースの統一）
  const normalizeName = (name) => {
    if (!name) return '';
    // 全角スペース→半角スペース、連続スペース→単一スペース、前後のスペース削除
    return name.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // シフト記号を正規化
  const normalizeShift = (shift) => {
    if (!shift) return '';
    const s = shift.trim();
    if (s === '日' || s === '日勤' || s === 'D') return '日';
    if (s === '夜' || s === '夜勤' || s === 'N') return '夜';
    if (s === '明' || s === '夜明' || s === '夜勤明' || s === 'A') return '明';
    if (s === '休' || s === '公休' || s === '公' || s === 'O') return '休';
    if (s === '有' || s === '有休' || s === '有給' || s === 'Y') return '有';
    // nanや空白も休み扱い
    if (s === 'nan' || s === 'NaN') return '休';
    return s;
  };

  // 前月データをクリア
  const clearPreviousMonthData = () => {
    setPreviousMonthData(null);
    setPrevMonthConstraints({});
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    // DBからも削除
    const pmKey = `prevMonth-${targetYear}-${targetMonth}`;
    saveSettingToDB(pmKey, JSON.stringify({ data: null, constraints: {} }))
      .catch(e => console.error('前月データ削除エラー:', e));
  };

  // 勤務表自動生成（本格版）
  const generateSchedule = () => {
    setGenerating(true);
    setShowGenerateConfig(false);
    
    setTimeout(() => {
      const monthKey = `${targetYear}-${targetMonth}`;
      const holidays = []; // 祝日リスト（必要に応じて設定）
      
      // 週ごとの夜勤人数を計算（月曜〜日曜ベース）
      const getWeeklyNightStaff = () => {
        const weeks = [];
        const firstDay = new Date(targetYear, targetMonth, 1);
        const firstDayOfWeek = firstDay.getDay(); // 0=日, 1=月, ...
        
        // 月の1日が含まれる週の月曜日を計算
        let currentDay = 1;
        let weekIndex = 0;
        
        // 第1週（月初から最初の日曜日まで）
        const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
        if (daysUntilSunday > 0) {
          const nightCount = generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1];
          weeks.push({
            startDay: 1,
            endDay: Math.min(daysUntilSunday, daysInMonth),
            count: nightCount,
            weekNum: 1
          });
          currentDay = daysUntilSunday + 1;
          weekIndex = 1;
        }
        
        // 残りの週（月曜〜日曜）
        while (currentDay <= daysInMonth) {
          const patternIndex = generateConfig.startWithThree ? (weekIndex % 2) : ((weekIndex + 1) % 2);
          const nightCount = generateConfig.nightShiftPattern[patternIndex];
          const endDay = Math.min(currentDay + 6, daysInMonth);
          
          weeks.push({
            startDay: currentDay,
            endDay: endDay,
            count: nightCount,
            weekNum: weekIndex + 1
          });
          
          currentDay = endDay + 1;
          weekIndex++;
        }
        
        return weeks;
      };
      
      const weeklyNightStaff = getWeeklyNightStaff();
      console.log('週ごとの夜勤設定:', weeklyNightStaff);
      
      // 設定値
      const config = {
        maxNightShifts: generateConfig.maxNightShifts,
        minDaysOff: generateConfig.minDaysOff,
        maxConsecutiveNights: 2,
        maxConsecutiveDays: generateConfig.maxConsecutiveDays,
        beds: 8,
        ratio: 4,
        weeklyNightStaff: weeklyNightStaff
      };

      const isWeekendOrHoliday = (day) => {
        const date = new Date(targetYear, targetMonth, day + 1);
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6 || holidays.includes(day + 1);
      };

      const isSunday = (day) => {
        const date = new Date(targetYear, targetMonth, day + 1);
        return date.getDay() === 0;
      };

      // 年末年始判定
      const isYearEnd = (day) => {
        // 12月30日、31日
        return targetMonth === 11 && (day + 1 === 30 || day + 1 === 31);
      };

      const isNewYear = (day) => {
        // 1月1日、2日、3日
        return targetMonth === 0 && (day + 1 >= 1 && day + 1 <= 3);
      };

      // 日勤者数の要件を取得
      const getDayStaffRequirement = (day) => {
        if (isYearEnd(day)) return generateConfig.yearEndDayStaff;
        if (isNewYear(day)) return generateConfig.newYearDayStaff;
        if (isWeekendOrHoliday(day)) return generateConfig.weekendDayStaff;
        return generateConfig.weekdayDayStaff;
      };

      const getNightRequirement = (dayIndex) => {
        const day = dayIndex + 1;
        for (const period of config.weeklyNightStaff) {
          if (day >= period.startDay && day <= period.endDay) {
            return period.count;
          }
        }
        return 3;
      };

      // 休み希望を取得
      const existingRequests = {};
      activeNurses.forEach(nurse => {
        existingRequests[nurse.id] = {};
        const nurseRequests = requests[monthKey]?.[String(nurse.id)] || {};
        Object.entries(nurseRequests).forEach(([day, value]) => {
          existingRequests[nurse.id][parseInt(day) - 1] = value;
        });
      });

      // 候補生成関数
      const generateCandidate = (seed) => {
        const newSchedule = {};
        const stats = {};
        
        const targetDaysOff = 9;
        const targetWorkDays = 21;
        
        // 役職別の看護師リスト
        const headNurse = activeNurses.find(n => n.position === '師長');
        const chiefNurses = activeNurses.filter(n => n.position === '主任');
        const deputyNurses = activeNurses.filter(n => n.position === '副主任');
        const managementNurses = [...chiefNurses, ...deputyNurses];

        // 初期化
        activeNurses.forEach(nurse => {
          newSchedule[nurse.id] = Array(daysInMonth).fill(null);
          stats[nurse.id] = { 
            nightCount: 0, 
            dayWorkCount: 0, 
            daysOff: 0,
            totalWork: 0,
            weekendWork: 0,
            consecutiveDays: 0
          };
          
          // ★★★ 前月データに基づく制約を最優先で適用（1〜3日目）★★★
          // 制約キーは1ベース（1=1日目, 2=2日目, 3=3日目）
          if (prevMonthConstraints[nurse.id]) {
            const constraints = prevMonthConstraints[nurse.id];
            for (const [dayStr, shift] of Object.entries(constraints)) {
              const day = parseInt(dayStr);       // 1ベース（1,2,3）
              const dayIndex = day - 1;            // 0ベース配列用
              if (dayIndex >= 0 && dayIndex < daysInMonth) {
                newSchedule[nurse.id][dayIndex] = shift;
                if (shift === '休' || shift === '有') {
                  stats[nurse.id].daysOff++;
                } else if (shift === '夜') {
                  stats[nurse.id].nightCount++;
                  stats[nurse.id].totalWork++;
                } else if (shift !== '明') {
                  stats[nurse.id].totalWork++;
                }
              }
            }
          }
          
          // 既存の休み希望をコピー（前月制約で埋まっていない日のみ）
          // ★★★ 職員の希望内容は最優先で全て反映する ★★★
          if (existingRequests[nurse.id]) {
            for (let day = 0; day < daysInMonth; day++) {
              if (newSchedule[nurse.id][day]) continue; // 前月制約で埋まっている
              const existingShift = existingRequests[nurse.id][day];
              if (existingShift) {
                newSchedule[nurse.id][day] = existingShift;
                if (existingShift === '休' || existingShift === '有') {
                  stats[nurse.id].daysOff++;
                } else if (existingShift === '夜') {
                  stats[nurse.id].nightCount++;
                  stats[nurse.id].totalWork++;
                  // 夜勤希望時、翌日自動明け
                  if (day + 1 < daysInMonth && !newSchedule[nurse.id][day + 1]) {
                    newSchedule[nurse.id][day + 1] = '明';
                  }
                } else if (existingShift === '日') {
                  stats[nurse.id].dayWorkCount++;
                  stats[nurse.id].totalWork++;
                } else if (existingShift !== '明') {
                  stats[nurse.id].totalWork++;
                }
              }
            }
          }
        });

        // 休み希望がない場合、ランダムに休日を配置（4日目以降のみ）
        activeNurses.forEach((nurse, idx) => {
          const currentDaysOff = stats[nurse.id].daysOff;
          if (currentDaysOff < targetDaysOff) {
            const offDays = new Set();
            let attempts = 0;
            while (offDays.size < (targetDaysOff - currentDaysOff) && attempts < 100) {
              const rng = seed + idx * 7919 + attempts * 997;
              // 前月制約がある場合は4日目以降からランダム配置
              const minDay = Object.keys(prevMonthConstraints).length > 0 ? 3 : 0;
              const day = minDay + Math.floor((Math.abs(Math.sin(rng) * 10000)) % (daysInMonth - minDay));
              if (!newSchedule[nurse.id][day]) {
                offDays.add(day);
              }
              attempts++;
            }
            
            offDays.forEach(day => {
              newSchedule[nurse.id][day] = '休';
              stats[nurse.id].daysOff++;
            });
          }
        });

        // 各日のシフト割り当て
        for (let day = 0; day < daysInMonth; day++) {
          const isSpecialDay = isWeekendOrHoliday(day);
          const sundayFlag = isSunday(day);
          const dayRequirement = getDayStaffRequirement(day); // 日勤者数要件を取得
          
          // 夜勤割り当て
          const availableForNight = activeNurses.filter(nurse => {
            if (newSchedule[nurse.id][day]) return false;
            // 職員別夜勤上限を取得
            const nursePref = nurseShiftPrefs[nurse.id];
            const nurseMaxNight = nursePref?.noNightShift ? 0 : (nursePref?.maxNightShifts ?? config.maxNightShifts);
            if (stats[nurse.id].nightCount >= nurseMaxNight) return false;
            // 翌日（明け用）が空いているか
            if (day + 1 < daysInMonth && newSchedule[nurse.id][day + 1] && newSchedule[nurse.id][day + 1] !== '明') return false;
            // 翌々日（休み用）が空いているか確認（ブロックはしないが優先度に影響）
            if (day > 0 && newSchedule[nurse.id][day - 1] === '夜') {
              if (day > 1 && newSchedule[nurse.id][day - 2] === '夜') return false;
            }
            if (stats[nurse.id].consecutiveDays >= config.maxConsecutiveDays) return false;
            return true;
          }).sort((a, b) => {
            const aNight = stats[a.id].nightCount;
            const bNight = stats[b.id].nightCount;
            if (aNight !== bNight) return aNight - bNight;
            // day+2が空いている人を優先
            const aDay2Free = day + 2 < daysInMonth && !newSchedule[a.id][day + 2] ? 0 : 1;
            const bDay2Free = day + 2 < daysInMonth && !newSchedule[b.id][day + 2] ? 0 : 1;
            if (aDay2Free !== bDay2Free) return aDay2Free - bDay2Free;
            if (isSpecialDay) {
              return stats[a.id].weekendWork - stats[b.id].weekendWork;
            }
            return stats[a.id].totalWork - stats[b.id].totalWork;
          });
          
          const nightStaff = availableForNight.slice(0, getNightRequirement(day));
          nightStaff.forEach(nurse => {
            newSchedule[nurse.id][day] = '夜';
            stats[nurse.id].nightCount++;
            stats[nurse.id].totalWork++;
            stats[nurse.id].consecutiveDays++;
            if (isSpecialDay) stats[nurse.id].weekendWork++;
            
            // 夜勤明けを設定
            if (day + 1 < daysInMonth && !newSchedule[nurse.id][day + 1]) {
              newSchedule[nurse.id][day + 1] = '明';
              stats[nurse.id].consecutiveDays = 0;
              
              // 夜勤明けの翌日は休み
              if (day + 2 < daysInMonth && !newSchedule[nurse.id][day + 2]) {
                newSchedule[nurse.id][day + 2] = '休';
                stats[nurse.id].daysOff++;
              }
            }
          });

          // 日勤割り当て
          const availableForDay = activeNurses.filter(nurse => {
            if (newSchedule[nurse.id][day]) return false;
            if (stats[nurse.id].consecutiveDays >= config.maxConsecutiveDays) return false;
            if (sundayFlag && nurse.position === '師長') return false;
            // 職員別「日勤なし」設定
            const nursePref = nurseShiftPrefs[nurse.id];
            if (nursePref?.noDayShift) return false;
            return true;
          }).sort((a, b) => {
            if (isSpecialDay) {
              const weekendDiff = stats[a.id].weekendWork - stats[b.id].weekendWork;
              if (weekendDiff !== 0) return weekendDiff;
            }
            return stats[a.id].totalWork - stats[b.id].totalWork;
          });
          
          const dayStaff = availableForDay.slice(0, dayRequirement);
          dayStaff.forEach(nurse => {
            newSchedule[nurse.id][day] = '日';
            stats[nurse.id].dayWorkCount++;
            stats[nurse.id].totalWork++;
            stats[nurse.id].consecutiveDays++;
            if (isSpecialDay) stats[nurse.id].weekendWork++;
          });
          
          // 師長が休みの日は主任・副主任が出勤しているかチェック
          if (headNurse) {
            const headShift = newSchedule[headNurse.id][day];
            if (headShift === '休' || headShift === '有') {
              const managementWorking = managementNurses.some(n => 
                newSchedule[n.id][day] === '日'
              );
              if (!managementWorking) {
                const availableManagement = managementNurses.find(n => 
                  !newSchedule[n.id][day] && stats[n.id].consecutiveDays < config.maxConsecutiveDays
                  && !nurseShiftPrefs[n.id]?.noDayShift
                );
                if (availableManagement) {
                  newSchedule[availableManagement.id][day] = '日';
                  stats[availableManagement.id].dayWorkCount++;
                  stats[availableManagement.id].totalWork++;
                  stats[availableManagement.id].consecutiveDays++;
                  if (isSpecialDay) stats[availableManagement.id].weekendWork++;
                }
              }
            }
          }
          
          // 休日で連続勤務リセット
          activeNurses.forEach(nurse => {
            const shift = newSchedule[nurse.id][day];
            if (shift === '休' || shift === '有') {
              stats[nurse.id].consecutiveDays = 0;
            }
          });
        }

        // 空きセルを埋める（★日勤者数を日別に管理してばらつきを抑制）
        // まず各日の日勤者数を集計
        const dailyDayCount: number[] = Array(daysInMonth).fill(0);
        for (let day = 0; day < daysInMonth; day++) {
          activeNurses.forEach(nurse => {
            const s = newSchedule[nurse.id][day];
            if (s === '日') dailyDayCount[day]++;
          });
        }

        activeNurses.forEach(nurse => {
          let consecutiveWork = 0;
          const nursePref = nurseShiftPrefs[nurse.id];
          const canDoDay = !nursePref?.noDayShift;
          for (let day = 0; day < daysInMonth; day++) {
            if (!newSchedule[nurse.id][day]) {
              const needsWork = stats[nurse.id].totalWork < targetWorkDays - 2;
              const needsRest = stats[nurse.id].daysOff < targetDaysOff - 2;
              const tooManyConsecutive = consecutiveWork >= config.maxConsecutiveDays;
              const shouldRest = consecutiveWork >= 4;
              const sundayFlag = isSunday(day);
              const canWorkDay = !(sundayFlag && nurse.position === '師長') && canDoDay;
              
              // この日の日勤者数要件
              const dayReq = getDayStaffRequirement(day);
              const dayAlreadyFull = dailyDayCount[day] >= dayReq;
              
              if (tooManyConsecutive || shouldRest || (!needsWork && consecutiveWork >= 3)) {
                newSchedule[nurse.id][day] = '休';
                stats[nurse.id].daysOff++;
                consecutiveWork = 0;
              } else if (needsWork && canWorkDay && !dayAlreadyFull) {
                // 日勤者数が足りない日に優先配置
                newSchedule[nurse.id][day] = '日';
                stats[nurse.id].totalWork++;
                stats[nurse.id].dayWorkCount++;
                dailyDayCount[day]++;
                consecutiveWork++;
                if (isWeekendOrHoliday(day)) stats[nurse.id].weekendWork++;
              } else if (needsWork && canWorkDay && dayAlreadyFull) {
                // 日勤者数は足りている → 勤務日数が不足なら配置、十分なら休み
                if (stats[nurse.id].totalWork < targetWorkDays - 4) {
                  newSchedule[nurse.id][day] = '日';
                  stats[nurse.id].totalWork++;
                  stats[nurse.id].dayWorkCount++;
                  dailyDayCount[day]++;
                  consecutiveWork++;
                  if (isWeekendOrHoliday(day)) stats[nurse.id].weekendWork++;
                } else {
                  newSchedule[nurse.id][day] = '休';
                  stats[nurse.id].daysOff++;
                  consecutiveWork = 0;
                }
              } else if (needsRest || !canWorkDay) {
                newSchedule[nurse.id][day] = '休';
                stats[nurse.id].daysOff++;
                consecutiveWork = 0;
              } else {
                if (consecutiveWork >= 2 || Math.random() > 0.6) {
                  newSchedule[nurse.id][day] = '休';
                  stats[nurse.id].daysOff++;
                  consecutiveWork = 0;
                } else if (canWorkDay && !dayAlreadyFull) {
                  newSchedule[nurse.id][day] = '日';
                  stats[nurse.id].totalWork++;
                  stats[nurse.id].dayWorkCount++;
                  dailyDayCount[day]++;
                  consecutiveWork++;
                  if (isWeekendOrHoliday(day)) stats[nurse.id].weekendWork++;
                } else {
                  newSchedule[nurse.id][day] = '休';
                  stats[nurse.id].daysOff++;
                  consecutiveWork = 0;
                }
              }
            } else {
              const shift = newSchedule[nurse.id][day];
              if (shift === '休' || shift === '有' || shift === '明') {
                consecutiveWork = 0;
              } else {
                consecutiveWork++;
              }
            }
          }
        });

        // ★★★ 事後調整：日勤者数が不足している日を補充 ★★★
        for (let day = 0; day < daysInMonth; day++) {
          const dayReq = getDayStaffRequirement(day);
          while (dailyDayCount[day] < dayReq) {
            // 休みの職員から勤務日数が少ない人を選んで日勤に変更
            const candidate = activeNurses
              .filter(nurse => {
                const s = newSchedule[nurse.id][day];
                if (s !== '休') return false;
                if (nurseShiftPrefs[nurse.id]?.noDayShift) return false;
                // 前月制約・希望で設定された休みは変更しない
                if (prevMonthConstraints[nurse.id]?.[day + 1]) return false;  // 制約は1ベース
                const reqVal = existingRequests[nurse.id]?.[day];
                if (reqVal === '休' || reqVal === '有') return false;
                return true;
              })
              .sort((a, b) => stats[a.id].totalWork - stats[b.id].totalWork)[0];
            if (!candidate) break;
            newSchedule[candidate.id][day] = '日';
            stats[candidate.id].totalWork++;
            stats[candidate.id].dayWorkCount++;
            stats[candidate.id].daysOff--;
            dailyDayCount[day]++;
          }
        }

        return { schedule: newSchedule, stats };
      };

      // スコア計算関数
      const calculateScore = (schedule, stats) => {
        let score = 1000;
        
        activeNurses.forEach(nurse => {
          const shifts = schedule[nurse.id];
          const stat = stats[nurse.id];
          
          // 勤務日数バランス
          const targetWork = 21;
          const workDiff = Math.abs(stat.totalWork - targetWork);
          score -= workDiff * workDiff * 3;
          
          // 休日数バランス
          const targetOff = 9;
          const offDiff = Math.abs(stat.daysOff - targetOff);
          score -= offDiff * offDiff * 3;
          
          // 連続勤務チェック
          let consecutive = 0;
          let maxConsecutive = 0;
          for (let i = 0; i < shifts.length; i++) {
            if (shifts[i] && shifts[i] !== '休' && shifts[i] !== '有' && shifts[i] !== '明') {
              consecutive++;
              maxConsecutive = Math.max(maxConsecutive, consecutive);
            } else {
              consecutive = 0;
            }
          }
          
          if (maxConsecutive > config.maxConsecutiveDays) {
            score -= Math.pow(maxConsecutive - config.maxConsecutiveDays, 2) * 100;
          }
          
          // 夜勤回数
          const targetNights = 5;
          const nightDiff = Math.abs(stat.nightCount - targetNights);
          score -= nightDiff * nightDiff * 4;
          
          // 夜勤後の夜勤明け・休みチェック
          for (let i = 0; i < shifts.length - 1; i++) {
            if (shifts[i] === '夜') {
              if (shifts[i + 1] !== '明') score -= 100;
              if (i + 2 < shifts.length && shifts[i + 2] !== '休' && shifts[i + 2] !== '夜') score -= 50;
            }
          }

          // 職員別設定チェック（第2優先 - 希望と矛盾しない範囲で守る）
          const nursePref = nurseShiftPrefs[nurse.id];
          if (nursePref) {
            const nurseMaxNight = nursePref.noNightShift ? 0 : nursePref.maxNightShifts;
            // 夜勤なし設定の違反（希望で夜勤が入っている場合は軽いペナルティ）
            if (nursePref.noNightShift && stat.nightCount > 0) {
              score -= stat.nightCount * 200;
            }
            // 個別夜勤上限超過
            if (stat.nightCount > nurseMaxNight) {
              score -= (stat.nightCount - nurseMaxNight) * 150;
            }
            // 日勤なし設定の違反
            if (nursePref.noDayShift) {
              const dayShiftCount = shifts.filter((s: any) => s === '日').length;
              if (dayShiftCount > 0) {
                score -= dayShiftCount * 200;
              }
            }
          }
        });

        // ★★★ 日別日勤者数のばらつきペナルティ（生成設定の要件との乖離）★★★
        for (let day = 0; day < daysInMonth; day++) {
          let dayStaffCount = 0;
          let nightStaffCount = 0;
          activeNurses.forEach(nurse => {
            const s = schedule[nurse.id][day];
            if (s === '日') dayStaffCount++;
            if (s === '夜') nightStaffCount++;
          });
          const required = getDayStaffRequirement(day);
          const diff = Math.abs(dayStaffCount - required);
          if (diff > 0) {
            // 不足は重く、過剰はやや軽く
            score -= dayStaffCount < required ? diff * diff * 20 : diff * diff * 10;
          }

          // ★★★ 日別夜勤人数ペナルティ（最重要）★★★
          const nightRequired = getNightRequirement(day);
          const nightDiffDaily = nightStaffCount - nightRequired;
          if (nightDiffDaily !== 0) {
            // 不足は極めて重いペナルティ、過剰も重い
            score -= nightStaffCount < nightRequired
              ? Math.abs(nightDiffDaily) * 500
              : Math.abs(nightDiffDaily) * 300;
          }
        }
        
        return score;
      };

      // 複数の候補を生成して最良を選択
      const candidates = [];
      for (let i = 0; i < 15; i++) {
        const candidate = generateCandidate(i * 12345 + Date.now());
        const score = calculateScore(candidate.schedule, candidate.stats);
        candidates.push({ ...candidate, score });
      }

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];

      // ★★★ 夜勤人数の強制調整フェーズ（最重要）★★★
      const adjustedSchedule = JSON.parse(JSON.stringify(best.schedule));
      for (let day = 0; day < daysInMonth; day++) {
        const nightRequired = getNightRequirement(day);
        let nightCount = 0;
        activeNurses.forEach(nurse => {
          if (adjustedSchedule[nurse.id][day] === '夜') nightCount++;
        });

        // 夜勤不足の場合：追加割り当て
        let attempts = 0;
        while (nightCount < nightRequired && attempts < 20) {
          attempts++;
          // 夜勤可能な候補を探す（日勤・休み・空きの人）
          const candidates2 = activeNurses.filter(nurse => {
            const s = adjustedSchedule[nurse.id][day];
            if (s === '夜' || s === '明') return false; // 既に夜勤 or 明け
            // 前日が夜勤の人はダメ
            if (day > 0 && adjustedSchedule[nurse.id][day - 1] === '夜') return false;
            // 翌日が既に夜の人はダメ
            if (day + 1 < daysInMonth && adjustedSchedule[nurse.id][day + 1] === '夜') return false;
            // 夜勤なし設定
            const pref = nurseShiftPrefs[nurse.id];
            if (pref?.noNightShift) return false;
            return true;
          });
          if (candidates2.length === 0) break;

          // 夜勤回数が少ない順に割り当て
          candidates2.sort((a, b) => {
            const aN = adjustedSchedule[a.id].filter((s: any) => s === '夜').length;
            const bN = adjustedSchedule[b.id].filter((s: any) => s === '夜').length;
            return aN - bN;
          });

          const picked = candidates2[0];
          adjustedSchedule[picked.id][day] = '夜';
          // 翌日明け
          if (day + 1 < daysInMonth) {
            adjustedSchedule[picked.id][day + 1] = '明';
          }
          // 翌々日休み
          if (day + 2 < daysInMonth && adjustedSchedule[picked.id][day + 2] !== '夜') {
            adjustedSchedule[picked.id][day + 2] = '休';
          }
          nightCount++;
        }

        // 夜勤過剰の場合：余分を日勤に変換
        while (nightCount > nightRequired) {
          const nightNurses = activeNurses.filter(nurse => adjustedSchedule[nurse.id][day] === '夜');
          if (nightNurses.length === 0) break;
          // 夜勤回数が多い人から削除
          nightNurses.sort((a, b) => {
            const aN = adjustedSchedule[a.id].filter((s: any) => s === '夜').length;
            const bN = adjustedSchedule[b.id].filter((s: any) => s === '夜').length;
            return bN - aN;
          });
          const removed = nightNurses[0];
          adjustedSchedule[removed.id][day] = '日';
          // 翌日明けを復元
          if (day + 1 < daysInMonth && adjustedSchedule[removed.id][day + 1] === '明') {
            adjustedSchedule[removed.id][day + 1] = '日';
          }
          // 翌々日の自動休みを復元
          if (day + 2 < daysInMonth && adjustedSchedule[removed.id][day + 2] === '休') {
            adjustedSchedule[removed.id][day + 2] = '日';
          }
          nightCount--;
        }
      }

      // ★★★ 全体の夜→明→休 整合性チェック ★★★
      activeNurses.forEach(nurse => {
        for (let d = 0; d < daysInMonth; d++) {
          if (adjustedSchedule[nurse.id][d] === '夜') {
            if (d + 1 < daysInMonth && adjustedSchedule[nurse.id][d + 1] !== '明') {
              adjustedSchedule[nurse.id][d + 1] = '明';
            }
            if (d + 2 < daysInMonth && adjustedSchedule[nurse.id][d + 2] !== '夜' && adjustedSchedule[nurse.id][d + 2] !== '明') {
              adjustedSchedule[nurse.id][d + 2] = '休';
            }
          }
        }
      });

      // 配列形式に変換
      const finalSchedule = {};
      activeNurses.forEach(nurse => {
        finalSchedule[nurse.id] = adjustedSchedule[nurse.id];
      });

      setSchedule({ month: monthKey, data: finalSchedule });
      // DB保存
      saveSchedulesToDB(targetYear, targetMonth, finalSchedule).catch(e => console.error('DB保存エラー:', e));
      setGenerating(false);
    }, 1500);
  };

  // Excel出力
  const exportToExcel = () => {
    if (!schedule) {
      alert('勤務表が生成されていません');
      return;
    }

    const wb = XLSX.utils.book_new();
    const scheduleData = [
      [`HCU ${targetYear}年${targetMonth + 1}月 勤務表`],
      ['氏名', '役職', ...Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`)]
    ];

    activeNurses.forEach(nurse => {
      const shifts = schedule.data[nurse.id] || [];
      scheduleData.push([nurse.name, nurse.position, ...shifts.map(s => s || '-')]);
    });

    const ws = XLSX.utils.aoa_to_sheet(scheduleData);
    XLSX.utils.book_append_sheet(wb, ws, '勤務表');

    const fileName = `勤務表_${targetYear}年${targetMonth + 1}月_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // アクセスコード一覧をコピー
  const copyAllCodes = () => {
    const codes = nursesWithCodes.map(n => 
      `${n.name}（${n.position}）: ${n.accessCode}`
    ).join('\n');
    navigator.clipboard.writeText(codes).then(() => {
      alert('全員分のアクセスコードをコピーしました');
    });
  };

  // ============================================
  // 職員機能
  // ============================================

  const [dbStatus, setDbStatus] = useState<'ok' | 'error' | 'testing' | null>(null);
  const [dbError, setDbError] = useState('');

  const handleStaffLogin = async () => {
    const nurse = nursesWithCodes.find(n => n.accessCode === staffCode);
    if (nurse) {
      setStaffNurseId(nurse.id);
      setStaffError('');
      // ★ 最新データをDBから再取得（他のデバイスで入力されたデータを反映）
      setDbStatus('testing');
      try {
        await reloadRequestsFromDB();
        setDbStatus('ok');
      } catch (e: any) {
        setDbStatus('error');
        setDbError(e?.message || 'DB接続エラー');
        console.error('DB接続テスト失敗:', e);
      }
    } else {
      setStaffError('アクセスコードが正しくありません');
    }
  };

  const handleStaffLogout = () => {
    setStaffNurseId(null);
    setStaffCode('');
    setSystemMode('select');
  };

  const updateRequest = (day: any, value: any) => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const nurseIdKey = String(staffNurseId);
    setRequests((prev: any) => {
      const monthRequests = { ...(prev[monthKey] || {}) };
      const nurseRequests = { ...(monthRequests[nurseIdKey] || {}) };
      
      if (value) {
        nurseRequests[day] = value;
      } else {
        delete nurseRequests[day];
      }
      
      monthRequests[nurseIdKey] = nurseRequests;
      return { ...prev, [monthKey]: monthRequests };
    });
    // DB保存（エラー時にユーザーに通知）
    if (staffNurseId) {
      saveRequestToDB(staffNurseId, targetYear, targetMonth, day, value)
        .catch(e => {
          console.error('DB保存失敗:', e);
          alert('⚠️ 保存に失敗しました。管理者にお知らせください。\nエラー: ' + (e?.message || '不明'));
        });
    }
  };

  const getOtherRequestsCount = (day) => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const monthRequests = requests[monthKey] || {};
    const myIdKey = String(staffNurseId);
    let count = 0;
    Object.entries(monthRequests).forEach(([nurseIdKey, reqs]) => {
      if (nurseIdKey !== myIdKey && reqs[day]) {
        count++;
      }
    });
    return count;
  };

  // ============================================
  // 画面レンダリング
  // ============================================

  // システム選択画面
  if (systemMode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-lg border border-white/50">
          <div className="text-center mb-10">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-5 rounded-2xl inline-block mb-5 shadow-lg">
              <Calendar className="text-white" size={56} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">HCU勤務表システム</h1>
            <p className="text-lg font-bold text-indigo-600">{targetYear}年{targetMonth + 1}月</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setSystemMode('admin')}
              className="w-full px-6 py-5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              <Lock size={24} />
              管理者ログイン
            </button>
            
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-sm text-gray-500">または</span>
              </div>
            </div>
            
            <button
              onClick={() => setSystemMode('staff')}
              className="w-full px-6 py-5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              <Users size={24} />
              職員用（休み希望入力）
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            データはサーバーに安全に保存されます
          </p>
        </div>
      </div>
    );
  }

  // 管理者ログイン画面
  if (systemMode === 'admin' && !isAdminAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-md border border-white/50">
          <button
            onClick={() => setSystemMode('select')}
            className="mb-6 text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <Lock className="text-white" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">管理者ログイン</h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                placeholder="管理者パスワード"
              />
            </div>
            
            {adminError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {adminError}
              </div>
            )}
            
            <button
              onClick={handleAdminLogin}
              className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              ログイン
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl">
            <p>デモ用パスワード: <code className="bg-gray-200 px-2 py-0.5 rounded">admin123</code></p>
          </div>
        </div>
      </div>
    );
  }

  // ダッシュボード画面
  if (systemMode === 'dashboard' && isAdminAuth) {
    const months = [
      { num: 0, name: '1月' }, { num: 1, name: '2月' }, { num: 2, name: '3月' },
      { num: 3, name: '4月' }, { num: 4, name: '5月' }, { num: 5, name: '6月' },
      { num: 6, name: '7月' }, { num: 7, name: '8月' }, { num: 8, name: '9月' },
      { num: 9, name: '10月' }, { num: 10, name: '11月' }, { num: 11, name: '12月' }
    ];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const getMonthStatus = (monthNum: number) => {
      const mk = `${dashboardYear}-${monthNum}`;
      const monthReqs = requests[mk] || {};
      const reqCount = Object.keys(monthReqs).length;
      const hasSchedule = schedule && schedule.month === mk;
      
      if (hasSchedule) return { status: 'generated', label: '生成済み', count: 0 };
      if (reqCount > 0) return { status: 'collecting', label: '希望収集中', count: reqCount };
      return { status: 'empty', label: '未着手', count: 0 };
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileSpreadsheet className="text-indigo-600" size={24} />
                  HCU勤務表管理システム
                </h1>
                <p className="text-sm text-gray-500">ダッシュボード</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowSettings(!showSettings)} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${showSettings ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  <Settings size={16} /> 職員管理
                </button>
                <button onClick={() => setShowDeadlineSettings(true)} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm flex items-center gap-1">
                  <Clock size={16} /> 締め切り設定
                </button>
                <button onClick={handleAdminLogout} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm flex items-center gap-1">
                  <LogOut size={16} /> ログアウト
                </button>
              </div>
            </div>
          </div>

          {/* 職員管理パネル（ダッシュボード内） */}
          {showSettings && (
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <h2 className="text-lg font-bold text-gray-800">職員一覧（{activeNurses.length}名）</h2>
                <div className="flex gap-2">
                  <label className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer flex items-center gap-2 text-sm transition-colors">
                    <Upload size={16} />
                    Excel読込
                    <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                  </label>
                  <button onClick={() => setShowAddNurse(true)} className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 text-sm transition-colors">
                    <Plus size={16} /> 追加
                  </button>
                </div>
              </div>
              <div className="overflow-auto max-h-[50vh]">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="border p-2 text-left">氏名</th>
                      <th className="border p-2 text-center">役職</th>
                      <th className="border p-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map(nurse => (
                      <tr key={nurse.id} className="hover:bg-gray-50">
                        <td className="border p-2">
                          {editingNurse === nurse.id ? (
                            <input defaultValue={nurse.name} id={`dash-name-${nurse.id}`} className="px-2 py-1 border rounded w-full" />
                          ) : nurse.name}
                        </td>
                        <td className="border p-2 text-center">
                          {editingNurse === nurse.id ? (
                            <select defaultValue={nurse.position} id={`dash-pos-${nurse.id}`} className="px-2 py-1 border rounded">
                              {Object.keys(POSITIONS).map(pos => (
                                <option key={pos} value={pos}>{pos}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded ${POSITIONS[nurse.position]?.color}`}>{nurse.position}</span>
                          )}
                        </td>
                        <td className="border p-2 text-center">
                          {editingNurse === nurse.id ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => {
                                const name = (document.getElementById(`dash-name-${nurse.id}`) as HTMLInputElement).value;
                                const position = (document.getElementById(`dash-pos-${nurse.id}`) as HTMLSelectElement).value;
                                updateNurse(nurse.id, { name, position });
                                setEditingNurse(null);
                              }} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs"><Save size={14} /></button>
                              <button onClick={() => setEditingNurse(null)} className="px-2 py-1 bg-gray-300 rounded text-xs"><X size={14} /></button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => setEditingNurse(nurse.id)} className="px-2 py-1 bg-blue-100 text-blue-600 rounded text-xs"><Edit2 size={14} /></button>
                              <button onClick={() => { if(confirm(`${nurse.name}を削除しますか？`)) deleteNurse(nurse.id); }} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs"><Trash2 size={14} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 締め切り表示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <Clock className="text-blue-500" size={20} />
              <p className="text-blue-800">
                <strong>希望提出締め切り:</strong> 毎月{requestDeadline.day}日 {String(requestDeadline.hour).padStart(2, '0')}:{String(requestDeadline.minute).padStart(2, '0')}
              </p>
            </div>
          </div>

          {/* 年選択 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => setDashboardYear(prev => prev - 1)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-lg font-bold">◀</button>
              <h2 className="text-3xl font-bold text-gray-800">{dashboardYear}年</h2>
              <button onClick={() => setDashboardYear(prev => prev + 1)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-lg font-bold">▶</button>
            </div>
          </div>

          {/* 月カード */}
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {months.map(({ num, name }) => {
              const status = getMonthStatus(num);
              const isCurrentMonth = dashboardYear === currentYear && num === currentMonth;
              return (
                <button
                  key={num}
                  onClick={() => {
                    setTargetYear(dashboardYear);
                    setTargetMonth(num);
                    setShowSettings(false);
                    setSystemMode('adminSchedule');
                  }}
                  className={`p-4 rounded-2xl border-2 hover:shadow-lg transition-all ${
                    status.status === 'generated' ? 'bg-green-50 border-green-400' :
                    status.status === 'collecting' ? 'bg-yellow-50 border-yellow-400' :
                    'bg-gray-50 border-gray-200'
                  } ${isCurrentMonth ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                >
                  <div className="text-lg font-bold mb-2">{name}</div>
                  <div className="text-xs">
                    {status.status === 'generated' && (
                      <span className="flex items-center justify-center gap-1 text-green-700">
                        <CheckCircle size={14} />
                        {status.label}
                      </span>
                    )}
                    {status.status === 'collecting' && (
                      <span className="text-yellow-700">
                        {status.label}<br />
                        <span className="font-bold">{status.count}人</span>入力済
                      </span>
                    )}
                    {status.status === 'empty' && (
                      <span className="text-gray-400">{status.label}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 凡例 */}
          <div className="mt-6 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-4 border border-white/50">
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300"></div>
                <span>未着手</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-400"></div>
                <span>希望収集中</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 border border-green-400"></div>
                <span>生成済み</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded ring-2 ring-blue-500 ring-offset-1"></div>
                <span>今月</span>
              </div>
            </div>
          </div>

          {/* 使い方 */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>💡 使い方：</strong>月のカードをクリックすると、その月の勤務表画面に移動します。
            </p>
          </div>
        </div>

        {/* 締め切り設定モーダル */}
        {showDeadlineSettings && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">⏰ 希望提出締め切り設定</h3>
                <button onClick={() => setShowDeadlineSettings(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">締め切り日</label>
                  <select value={requestDeadline.day} onChange={(e) => setRequestDeadline(prev => ({ ...prev, day: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg">
                    {Array.from({ length: 28 }, (_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">時</label>
                    <select value={requestDeadline.hour} onChange={(e) => setRequestDeadline(prev => ({ ...prev, hour: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border rounded-lg">
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">分</label>
                    <select value={requestDeadline.minute} onChange={(e) => setRequestDeadline(prev => ({ ...prev, minute: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border rounded-lg">
                      {[0, 15, 30, 45, 59].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={() => setShowDeadlineSettings(false)}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  設定を保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 職員ログイン画面
  if (systemMode === 'staff' && !staffNurseId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-md border border-white/50">
          <button
            onClick={() => setSystemMode('select')}
            className="mb-6 text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <Users className="text-white" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">休み希望入力</h1>
            <p className="text-lg text-emerald-600 font-bold mt-1">{targetYear}年{targetMonth + 1}月分</p>
          </div>

          <div className="space-y-4">
            {/* 対象年月 */}
            <div className="bg-gray-50 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2 text-center">対象年月</label>
              <div className="flex justify-center gap-2">
                <select value={targetYear} onChange={(e) => setTargetYear(parseInt(e.target.value))}
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none">
                  {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                </select>
                <select value={targetMonth} onChange={(e) => setTargetMonth(parseInt(e.target.value))}
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-emerald-500 focus:outline-none">
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i + 1}月</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">アクセスコード（6桁）</label>
              <input
                type="text"
                value={staffCode}
                onChange={(e) => {
                  setStaffCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6));
                  setStaffError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && staffCode.length === 6 && handleStaffLogin()}
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-3xl font-mono tracking-widest focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            
            {staffError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {staffError}
              </div>
            )}
            
            <button
              onClick={handleStaffLogin}
              disabled={staffCode.length !== 6}
              className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              入力画面へ
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl">
            <p>アクセスコードは管理者から配布されます</p>
          </div>
        </div>
      </div>
    );
  }

  // 職員用休み希望入力画面
  if (systemMode === 'staff' && staffNurseId) {
    const nurse = nursesWithCodes.find(n => n.id === staffNurseId);
    if (!nurse) {
      setStaffNurseId(null);
      return null;
    }

    const monthKey = `${targetYear}-${targetMonth}`;
    const myIdKey = String(staffNurseId);
    const myRequests = requests[monthKey]?.[myIdKey] || {};
    const requestCount = Object.keys(myRequests).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">{nurse.name}さん</h1>
                <p className="text-lg font-bold text-emerald-600">{targetYear}年{targetMonth + 1}月の休み希望入力</p>
              </div>
              <button
                onClick={handleStaffLogout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors self-start"
              >
                <LogOut size={18} />
                終了
              </button>
            </div>
          </div>

          {/* DB接続状態 */}
          {dbStatus === 'error' && (
            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="text-2xl">⚠️</div>
                <div>
                  <p className="text-sm font-bold text-red-700">データベース接続エラー</p>
                  <p className="text-red-600 text-sm">入力した希望が保存されない可能性があります。管理者にお知らせください。</p>
                  <p className="text-red-400 text-xs mt-1">詳細: {dbError}</p>
                </div>
              </div>
            </div>
          )}
          {dbStatus === 'testing' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-700">🔄 データベース接続を確認中...</p>
            </div>
          )}

          {/* 提出期限 */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <Clock className="text-orange-500" size={20} />
              <div>
                <p className="text-sm font-bold text-orange-700">提出期限</p>
                <p className="text-orange-600">{targetYear}年{targetMonth + 1}月{requestDeadline.day}日 {String(requestDeadline.hour).padStart(2, '0')}:{String(requestDeadline.minute).padStart(2, '0')} まで</p>
              </div>
            </div>
          </div>

          {/* 入力状況 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-100 p-3 rounded-xl">
                  <Calendar className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">入力済み希望</p>
                  <p className="text-2xl font-bold text-emerald-600">{requestCount}日</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('入力した希望をすべてクリアしますか？')) {
                    setRequests(prev => {
                      const updated = { ...prev };
                      if (updated[monthKey]) {
                        delete updated[monthKey][myIdKey];
                      }
                      return updated;
                    });
                  }
                }}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                すべてクリア
              </button>
            </div>
          </div>

          {/* 操作説明 */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-800">
              <strong>操作方法：</strong>日付をタップすると「公休」→「有休」→「午前半休」→「午後半休」→「日勤」→「クリア」と切り替わります。
              <br />
              <span className="text-emerald-600">休:2 有:1</span> などは他の職員の希望数です。
              <br />
              <span className="text-orange-600">「前月」と表示された日は前月勤務に基づく制約のため変更できません。</span>
            </p>
          </div>

          {/* カレンダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-4 md:p-6 border border-white/50">
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                <div
                  key={day}
                  className={`text-center font-bold py-2 text-sm ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {/* 月初の空白 */}
              {Array.from({ length: new Date(targetYear, targetMonth, 1).getDay() }, (_, i) => (
                <div key={`empty-${i}`} />
              ))}
              
              {/* 日付 */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const request = myRequests[day];
                const othersCount = getOtherRequestsCount(day);
                const dayOfWeek = new Date(targetYear, targetMonth, day).getDay();
                const isHoliday = dayOfWeek === 0 || dayOfWeek === 6;
                const prevCon = (prevMonthConstraints as any)[staffNurseId]?.[day];
                const isLocked = !!prevCon; // 前月制約がある日はロック
                
                return (
                  <div key={day} className="relative">
                    <button
                      onClick={() => {
                        if (isLocked) return; // 前月制約日はタップ不可
                        if (!request) updateRequest(day, '休');
                        else if (request === '休') updateRequest(day, '有');
                        else if (request === '有') updateRequest(day, '前');
                        else if (request === '前') updateRequest(day, '後');
                        else if (request === '後') updateRequest(day, '日');
                        else updateRequest(day, null);
                      }}
                      className={`w-full aspect-square rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                        isLocked
                          ? prevCon === '明' ? 'bg-pink-100 border-pink-300 cursor-not-allowed opacity-80'
                          : 'bg-gray-200 border-gray-400 cursor-not-allowed opacity-80'
                          : request === '休'
                          ? 'bg-gray-200 border-gray-400 shadow-inner'
                          : request === '有'
                          ? 'bg-emerald-200 border-emerald-400 shadow-inner'
                          : request === '前'
                          ? 'bg-orange-200 border-orange-400 shadow-inner'
                          : request === '後'
                          ? 'bg-amber-200 border-amber-400 shadow-inner'
                          : request === '日'
                          ? 'bg-blue-200 border-blue-400 shadow-inner'
                          : isHoliday
                          ? 'bg-red-50 border-red-100 hover:border-red-300'
                          : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow'
                      }`}
                    >
                      <span className={`text-sm md:text-base font-medium ${
                        dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'
                      }`}>
                        {day}
                      </span>
                      {isLocked ? (
                        <span className={`text-xs font-bold ${prevCon === '明' ? 'text-pink-600' : 'text-gray-600'}`}>
                          {prevCon === '明' ? '夜明' : '公休'}
                        </span>
                      ) : request ? (
                        <span className={`text-xs font-bold ${
                          request === '休' ? 'text-gray-600' :
                          request === '有' ? 'text-emerald-700' :
                          request === '前' ? 'text-orange-700' :
                          request === '後' ? 'text-amber-700' :
                          request === '日' ? 'text-blue-700' : ''
                        }`}>
                          {request === '休' ? '公休' : request === '有' ? '有休' : request === '前' ? '午前半休' : request === '後' ? '午後半休' : request === '日' ? '日勤' : request}
                        </span>
                      ) : null}
                      {isLocked && (
                        <span className="text-[9px] text-orange-500">前月</span>
                      )}
                    </button>
                    
                    {othersCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold shadow">
                        {othersCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* フッター */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <div className="flex items-center justify-center gap-4">
              <p>入力内容は自動保存されます</p>
              <button
                onClick={async () => {
                  await reloadRequestsFromDB();
                  alert('✅ 最新データを読み込みました');
                }}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors flex items-center gap-1"
              >
                <RefreshCw size={14} />
                最新データ読込
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 管理者画面
  // ============================================
  
  const monthKey = `${targetYear}-${targetMonth}`;
  const monthRequests = requests[monthKey] || {};
  const totalRequests: number = Object.values(monthRequests).reduce((sum: number, reqs: any) => sum + Object.keys(reqs as any).length, 0) as number;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">HCU勤務表システム</h1>
              <p className="text-lg font-bold text-indigo-600">{targetYear}年{targetMonth + 1}月</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSystemMode('dashboard')}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors"
              >
                ← ダッシュボード
              </button>
              <button
                onClick={() => setShowAccessCodes(true)}
                className="px-4 py-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Lock size={18} />
                コード発行
              </button>
              <button
                onClick={async () => {
                  const results: string[] = [];
                  try {
                    const { error: r1 } = await supabase.from('hcu_requests').select('nurse_id').limit(1);
                    results.push(r1 ? '❌ requests READ: ' + r1.message : '✅ requests READ: OK');
                  } catch (e: any) { results.push('❌ requests READ: ' + e.message); }
                  try {
                    const { error: w1 } = await supabase.from('hcu_requests').upsert(
                      { nurse_id: 99999, year: 1999, month: 0, day: 99, shift_type: 'test' },
                      { onConflict: 'nurse_id,year,month,day' }
                    );
                    if (w1) { results.push('❌ requests WRITE: ' + w1.message); }
                    else {
                      results.push('✅ requests WRITE: OK');
                      await supabase.from('hcu_requests').delete().eq('nurse_id', 99999);
                    }
                  } catch (e: any) { results.push('❌ requests WRITE: ' + e.message); }
                  try {
                    const { error: r2 } = await supabase.from('hcu_nurses').select('id').limit(1);
                    results.push(r2 ? '❌ nurses READ: ' + r2.message : '✅ nurses READ: OK');
                  } catch (e: any) { results.push('❌ nurses READ: ' + e.message); }
                  try {
                    const { error: r3 } = await supabase.from('hcu_schedules').select('id').limit(1);
                    results.push(r3 ? '❌ schedules READ: ' + r3.message : '✅ schedules READ: OK');
                  } catch (e: any) { results.push('❌ schedules READ: ' + e.message); }
                  try {
                    const { error: r4 } = await supabase.from('hcu_settings').select('key').limit(1);
                    results.push(r4 ? '❌ settings READ: ' + r4.message : '✅ settings READ: OK');
                  } catch (e: any) { results.push('❌ settings READ: ' + e.message); }
                  alert('【DB診断結果】\n\n' + results.join('\n'));
                }}
                className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl flex items-center gap-2 transition-colors border border-gray-200"
              >
                <Activity size={18} />
                DB診断
              </button>
              <button
                onClick={async () => {
                  // ★ まずDBから最新の希望データを取得
                  const freshData = await reloadRequestsFromDB();
                  const mk = `${targetYear}-${targetMonth}`;
                  if (!originalRequests[mk] && freshData) {
                    setOriginalRequests((prev: any) => ({
                      ...prev,
                      [mk]: JSON.parse(JSON.stringify(freshData[mk] || {}))
                    }));
                  }
                  setShowRequestReview(true);
                }}
                className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Eye size={18} />
                希望確認
              </button>
              <button
                onClick={() => setShowPrevMonthImport(true)}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                  previousMonthData ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Upload size={18} />
                前月読込{previousMonthData ? '✓' : ''}
              </button>
              <button
                onClick={() => setShowGenerateConfig(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Settings size={18} />
                生成設定
              </button>
              <button
                onClick={() => setShowNurseShiftPrefs(true)}
                className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl flex items-center gap-2 transition-colors border border-purple-200"
              >
                <Moon size={18} />
                職員別設定
              </button>
              <button
                onClick={generateSchedule}
                disabled={generating}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl flex items-center gap-2 shadow hover:shadow-lg transition-all disabled:opacity-50"
              >
                <RefreshCw size={18} className={generating ? 'animate-spin' : ''} />
                {generating ? '生成中...' : '自動生成'}
              </button>
              {schedule && (
                <button
                  onClick={() => {
                    if (confirm('勤務表データを消去しますか？\n\n※ 前月の読込データと職員の休み希望はそのまま保持されます。')) {
                      setSchedule(null);
                      // DBから勤務表データのみ削除
                      (async () => {
                        try {
                          await supabase.from('hcu_schedules').delete()
                            .eq('year', targetYear).eq('month', targetMonth);
                          console.log('勤務表データを消去しました');
                        } catch (e) { console.error('消去エラー:', e); }
                      })();
                    }
                  }}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl flex items-center gap-2 transition-colors border border-red-200"
                >
                  <Trash2 size={18} />
                  勤務表消去
                </button>
              )}
              <button
                onClick={handleAdminLogout}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <LogOut size={18} />
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-3 rounded-xl">
                <Users className="text-indigo-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">登録職員</p>
                <p className="text-2xl font-bold text-indigo-600">{activeNurses.length}名</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-3 rounded-xl">
                <Calendar className="text-emerald-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">希望入力済</p>
                <p className="text-2xl font-bold text-emerald-600">{totalRequests}件</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-3 rounded-xl">
                <Moon className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">対象月</p>
                <p className="text-2xl font-bold text-purple-600">{targetMonth + 1}月</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className={`${previousMonthData ? 'bg-orange-100' : 'bg-gray-100'} p-3 rounded-xl`}>
                <Upload className={previousMonthData ? 'text-orange-600' : 'text-gray-400'} size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">前月データ</p>
                <p className={`text-2xl font-bold ${previousMonthData ? 'text-orange-600' : 'text-gray-400'}`}>
                  {previousMonthData ? '読込済' : '未読込'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 前月制約表示（前月データがある場合） */}
        {previousMonthData && Object.keys(prevMonthConstraints).length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-orange-600" size={20} />
                <span className="font-medium text-orange-800">前月データに基づく当月初の制約が設定されています</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPrevMonthReview(true)}
                className="text-sm text-orange-600 hover:text-orange-800 underline"
              >
                詳細を確認
              </button>
            </div>
            <p className="text-sm text-orange-700 mt-2">
              {Object.keys(prevMonthConstraints).filter(id => Object.keys(prevMonthConstraints[id]).length > 0).length}名に
              当月1〜3日目の制約が適用されます（夜勤明け・休みなど）
            </p>
          </div>
        )}

        {/* 職員管理パネル */}
        {showSettings && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-gray-800">職員一覧（{activeNurses.length}名）</h2>
              <div className="flex gap-2">
                <label className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer flex items-center gap-2 transition-colors">
                  <Upload size={18} />
                  Excel読込
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => setShowAddNurse(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Plus size={18} />
                  追加
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeNurses.map(nurse => (
                <div
                  key={nurse.id}
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 p-3 rounded-xl transition-colors"
                >
                  {editingNurse === nurse.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={nurse.name}
                        className="flex-1 px-2 py-1 border rounded"
                        id={`edit-name-${nurse.id}`}
                      />
                      <select
                        defaultValue={nurse.position}
                        className="px-2 py-1 border rounded"
                        id={`edit-pos-${nurse.id}`}
                      >
                        {Object.keys(POSITIONS).map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const name = (document.getElementById(`edit-name-${nurse.id}`) as HTMLInputElement).value;
                          const position = (document.getElementById(`edit-pos-${nurse.id}`) as HTMLSelectElement).value;
                          updateNurse(nurse.id, { name, position });
                          setEditingNurse(null);
                        }}
                        className="p-1 text-emerald-600 hover:text-emerald-800 cursor-pointer"
                      >
                        <Save size={18} className="pointer-events-none" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingNurse(null);
                        }}
                        className="p-1 text-gray-600 hover:text-gray-800 cursor-pointer"
                      >
                        <X size={18} className="pointer-events-none" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded-lg border ${POSITIONS[nurse.position]?.color}`}>
                          {nurse.position}
                        </span>
                        <span className="font-medium">{nurse.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingNurse(nurse.id);
                          }}
                          className="p-2 text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
                        >
                          <Edit2 size={16} className="pointer-events-none" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteConfirm(nurse);
                          }}
                          className="p-2 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 勤務表表示エリア（生成前・後共通） */}
        {(() => {
          // 表示用データを計算（schedule存在時はそのデータ、未生成時は希望＋制約から構築）
          const scheduleDisplayData: { [key: string]: any[] } = {};
          if (schedule) {
            Object.assign(scheduleDisplayData, schedule.data);
          } else {
            activeNurses.forEach(nurse => {
              const shifts = new Array(daysInMonth).fill(null);
              // 前月制約を反映
              if (prevMonthConstraints[nurse.id]) {
                for (const [dayStr, shift] of Object.entries(prevMonthConstraints[nurse.id])) {
                  const dayIndex = parseInt(dayStr) - 1;
                  if (dayIndex >= 0 && dayIndex < daysInMonth) shifts[dayIndex] = shift;
                }
              }
              // 希望を反映（制約で埋まっていない日のみ）
              const nurseReqs = monthRequests[String(nurse.id)] || {};
              for (const [dayStr, val] of Object.entries(nurseReqs)) {
                const dayIndex = parseInt(dayStr) - 1;
                if (dayIndex >= 0 && dayIndex < daysInMonth && !shifts[dayIndex]) {
                  shifts[dayIndex] = val;
                }
              }
              scheduleDisplayData[nurse.id] = shifts;
            });
          }

          // セル編集ハンドラ（schedule未生成時は自動作成）
          const handleCellClick = (nurseId: any, dayIndex: number, currentShift: string | null) => {
            const CYCLE = ['日', '夜', '休', '有', null];
            const currentIdx = currentShift ? CYCLE.indexOf(currentShift) : -1;
            const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % CYCLE.length : 0;
            const newShift = CYCLE[nextIdx];
            const prevShift = currentShift;

            const updateData = (data: any) => {
              const newData = JSON.parse(JSON.stringify(data));
              if (!newData[nurseId]) newData[nurseId] = new Array(daysInMonth).fill(null);
              
              // 以前「夜」だった場合 → 翌日の「明」と翌々日の「休」を元に戻す
              if (prevShift === '夜') {
                if (dayIndex + 1 < daysInMonth && newData[nurseId][dayIndex + 1] === '明') {
                  const mk = `${targetYear}-${targetMonth}`;
                  const nurseIdKey = String(nurseId);
                  const origNext = requests[mk]?.[nurseIdKey]?.[dayIndex + 2];
                  newData[nurseId][dayIndex + 1] = origNext || null;
                }
                if (dayIndex + 2 < daysInMonth && newData[nurseId][dayIndex + 2] === '休') {
                  const mk = `${targetYear}-${targetMonth}`;
                  const nurseIdKey = String(nurseId);
                  const origNext2 = requests[mk]?.[nurseIdKey]?.[dayIndex + 3];
                  newData[nurseId][dayIndex + 2] = origNext2 || null;
                }
              }
              
              newData[nurseId][dayIndex] = newShift;
              
              // 「夜」を選択した場合 → 翌日を「明」、翌々日を「休」
              if (newShift === '夜') {
                if (dayIndex + 1 < daysInMonth) {
                  newData[nurseId][dayIndex + 1] = '明';
                }
                if (dayIndex + 2 < daysInMonth && !newData[nurseId][dayIndex + 2]) {
                  newData[nurseId][dayIndex + 2] = '休';
                }
              }
              
              return newData;
            };

            if (schedule) {
              setSchedule((prev: any) => ({
                ...prev,
                data: updateData(prev.data)
              }));
            } else {
              // 未生成時：scheduleを新規作成
              const baseData = {};
              activeNurses.forEach(nurse => {
                baseData[nurse.id] = scheduleDisplayData[nurse.id] ? [...scheduleDisplayData[nurse.id]] : new Array(daysInMonth).fill(null);
              });
              const newData = updateData(baseData);
              setSchedule({ month: `${targetYear}-${targetMonth}`, data: newData });
            }
          };

          return (
          <div className={`bg-white/90 backdrop-blur-sm shadow-lg border border-white/50 ${
            isMaximized ? 'fixed inset-0 z-50 rounded-none p-4 overflow-y-auto' : 'rounded-2xl p-6'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                {targetYear}年{targetMonth + 1}月 勤務表
                {!schedule && <span className="ml-2 text-sm font-normal text-orange-600 bg-orange-50 px-2 py-1 rounded">未生成（手動編集可能）</span>}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2 transition-colors"
                >
                  {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  {isMaximized ? '元に戻す' : '最大化'}
                </button>
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Download size={18} />
                  Excel出力
                </button>
              </div>
            </div>

            {/* 手動編集の説明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>💡 手動編集：</strong>セルをクリックすると「日」→「夜」→「休」→「有」→「空」と切り替わります。「夜」選択時は翌日が自動で「明」、翌々日が自動で「休」になります。
              </p>
            </div>

            {/* 希望・前月制約の反映状態 */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-700 mb-2">
                <strong>🔍 希望・前月制約の反映状態：</strong>
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="inline-block w-5 h-5 border-2 border-green-500 rounded"></span>
                  <span>= 希望通り</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-5 h-5 border-2 border-red-400 rounded"></span>
                  <span>= 希望と異なる</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-5 h-5 border-2 border-orange-400 rounded"></span>
                  <span>= 前月制約と異なる</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block px-1 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">元:休</span>
                  <span>= 元の希望</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block px-1 py-0.5 bg-orange-100 text-orange-500 rounded text-[10px]">前:明</span>
                  <span>= 前月制約</span>
                </div>
              </div>
            </div>
            
            <div className={`overflow-auto border rounded-lg ${isMaximized ? 'max-h-[calc(100vh-280px)]' : 'max-h-[70vh]'}`}>
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-100">
                    <th className="border p-2 sticky left-0 bg-gray-100 z-30">氏名</th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dow = getDayOfWeek(targetYear, targetMonth, day);
                      const isHoliday = dow === '日' || dow === '土';
                      return (
                        <th
                          key={day}
                          className={`border p-1 min-w-[32px] ${isHoliday ? 'bg-red-50' : 'bg-gray-100'}`}
                        >
                          <div className={`text-xs ${dow === '日' ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>
                            {dow}
                          </div>
                          <div>{day}</div>
                        </th>
                      );
                    })}
                    {/* 個人別統計ヘッダー */}
                    <th className="border p-1 bg-purple-100 text-purple-800 text-xs sticky right-[72px] z-20">夜勤</th>
                    <th className="border p-1 bg-blue-100 text-blue-800 text-xs sticky right-[48px] z-20">日勤</th>
                    <th className="border p-1 bg-gray-200 text-gray-700 text-xs sticky right-[24px] z-20">休日</th>
                    <th className="border p-1 bg-amber-100 text-amber-800 text-xs sticky right-0 z-20">出勤</th>
                  </tr>
                </thead>
                <tbody>
                  {activeNurses.map(nurse => {
                    const shifts = scheduleDisplayData[nurse.id] || [];
                    // 個人別統計を計算
                    const stats = {
                      night: shifts.filter(s => s === '夜').length,
                      day: shifts.filter(s => s === '日').length,
                      off: shifts.filter(s => s === '休' || s === '有' || s === '明').length,
                      work: shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length
                    };
                    
                    return (
                      <tr key={nurse.id} className="hover:bg-gray-50">
                        <td className="border p-2 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                          <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                            {nurse.position.charAt(0)}
                          </span>
                          {nurse.name}
                          {nurseShiftPrefs[nurse.id]?.noNightShift && <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 px-1 rounded">夜×</span>}
                          {nurseShiftPrefs[nurse.id]?.noDayShift && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">日×</span>}
                        </td>
                        {shifts.map((shift: any, i: number) => {
                          const day = i + 1;
                          const nurseIdKey = String(nurse.id);
                          const mk = `${targetYear}-${targetMonth}`;
                          const reqVal = (requests[mk]?.[nurseIdKey] || {})[day];
                          const prevCon = (prevMonthConstraints as any)[nurse.id]?.[day];
                          // 希望との比較
                          const matchesRequest = reqVal && shift === reqVal;
                          const differsFromRequest = reqVal && shift !== reqVal;
                          const differsFromPrev = prevCon && shift !== prevCon;
                          return (
                          <td
                            key={i}
                            onClick={() => {
                              const CYCLE = ['日', '夜', '休', '有', null];
                              const curIdx = shift ? CYCLE.indexOf(shift) : -1;
                              // 「明」は自動設定のみなので、クリック時は「休」へ進む
                              const nextIdx = (shift === '明') ? CYCLE.indexOf('休') : (curIdx >= 0 ? (curIdx + 1) % CYCLE.length : 0);
                              const newShift = CYCLE[nextIdx];
                              const prevShift = shift;
                              
                              const doUpdate = (prevData: any) => {
                                const newData = JSON.parse(JSON.stringify(prevData));
                                if (!newData[nurse.id]) newData[nurse.id] = new Array(daysInMonth).fill(null);
                                
                                // 以前「夜」だった場合 → 翌日の「明」と翌々日の「休」を元に戻す
                                if (prevShift === '夜') {
                                  // 翌日「明」を復元
                                  if (i + 1 < daysInMonth && newData[nurse.id][i + 1] === '明') {
                                    const bk1 = `sched-${nurse.id}-${i + 1}`;
                                    const origVal1 = autoAkeBackup[bk1] ?? null;
                                    newData[nurse.id][i + 1] = origVal1;
                                    updateScheduleCellInDB(nurse.id, targetYear, targetMonth, i + 2, origVal1);
                                    setAutoAkeBackup(prev => { const n = {...prev}; delete n[bk1]; return n; });
                                  }
                                  // 翌々日「休」を復元
                                  if (i + 2 < daysInMonth && newData[nurse.id][i + 2] === '休') {
                                    const bk2 = `sched-${nurse.id}-${i + 2}`;
                                    const origVal2 = autoAkeBackup[bk2] ?? null;
                                    newData[nurse.id][i + 2] = origVal2;
                                    updateScheduleCellInDB(nurse.id, targetYear, targetMonth, i + 3, origVal2);
                                    setAutoAkeBackup(prev => { const n = {...prev}; delete n[bk2]; return n; });
                                  }
                                }
                                
                                newData[nurse.id][i] = newShift;
                                
                                // 「夜」を選択 → 翌日を「明」、翌々日を「休」に設定
                                if (newShift === '夜') {
                                  if (i + 1 < daysInMonth) {
                                    const bk1 = `sched-${nurse.id}-${i + 1}`;
                                    setAutoAkeBackup(prev => ({...prev, [bk1]: newData[nurse.id][i + 1]}));
                                    newData[nurse.id][i + 1] = '明';
                                    updateScheduleCellInDB(nurse.id, targetYear, targetMonth, i + 2, '明');
                                  }
                                  if (i + 2 < daysInMonth) {
                                    const bk2 = `sched-${nurse.id}-${i + 2}`;
                                    setAutoAkeBackup(prev => ({...prev, [bk2]: newData[nurse.id][i + 2]}));
                                    newData[nurse.id][i + 2] = '休';
                                    updateScheduleCellInDB(nurse.id, targetYear, targetMonth, i + 3, '休');
                                  }
                                }
                                return newData;
                              };

                              if (schedule) {
                                setSchedule((prev: any) => ({
                                  ...prev,
                                  data: doUpdate(prev.data)
                                }));
                              } else {
                                // 未生成時：displayDataからscheduleを新規作成
                                const baseData = {};
                                activeNurses.forEach(n => {
                                  baseData[n.id] = scheduleDisplayData[n.id] ? [...scheduleDisplayData[n.id]] : new Array(daysInMonth).fill(null);
                                });
                                const newData = doUpdate(baseData);
                                setSchedule({ month: `${targetYear}-${targetMonth}`, data: newData });
                              }
                              updateScheduleCellInDB(nurse.id, targetYear, targetMonth, day, newShift);
                            }}
                            className={`border p-1 text-center cursor-pointer hover:bg-blue-50 transition-colors ${SHIFT_TYPES[shift]?.color || ''} ${
                              matchesRequest ? 'border-2 border-green-500' :
                              differsFromRequest ? 'border-2 border-red-400' :
                              differsFromPrev ? 'border-2 border-orange-400' : ''
                            }`}
                            style={{ minWidth: '32px' }}
                          >
                            <div>{shift || ''}</div>
                            {differsFromRequest && (
                              <div className="text-[9px] text-gray-400 leading-tight">元:{reqVal}</div>
                            )}
                            {differsFromPrev && !reqVal && (
                              <div className="text-[9px] text-orange-400 leading-tight">前:{prevCon}</div>
                            )}
                          </td>
                          );
                        })}
                        {/* 個人別統計 */}
                        <td className="border p-1 text-center bg-purple-50 font-bold text-purple-700 sticky right-[72px] z-[5]">{stats.night}</td>
                        <td className="border p-1 text-center bg-blue-50 font-bold text-blue-700 sticky right-[48px] z-[5]">{stats.day}</td>
                        <td className="border p-1 text-center bg-gray-100 font-bold text-gray-600 sticky right-[24px] z-[5]">{stats.off}</td>
                        <td className="border p-1 text-center bg-amber-50 font-bold text-amber-700 sticky right-0 z-[5]">{stats.work}</td>
                      </tr>
                    );
                  })}
                  
                  {/* 日別統計行 */}
                </tbody>
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="bg-purple-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-purple-50 z-30 text-purple-800">夜勤人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '夜') count++;
                      });
                      return (
                        <td key={i} className={`border p-1 text-center text-purple-700 ${count < 2 ? 'bg-red-200 text-red-700' : count > 3 ? 'bg-yellow-200 text-yellow-700' : ''}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-pink-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-pink-50 z-30 text-pink-800">夜明人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '明') count++;
                      });
                      return (
                        <td key={i} className="border p-1 text-center text-pink-700">
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-blue-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-blue-50 z-30 text-blue-800">日勤人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '日') count++;
                      });
                      const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                      const isWeekend = dow === '土' || dow === '日';
                      const day = i + 1;
                      // 年末年始判定
                      const isYearEnd = targetMonth === 11 && (day === 30 || day === 31);
                      const isNewYear = targetMonth === 0 && (day >= 1 && day <= 3);
                      const minRequired = isYearEnd ? generateConfig.yearEndDayStaff :
                                          isNewYear ? generateConfig.newYearDayStaff :
                                          isWeekend ? generateConfig.weekendDayStaff :
                                          generateConfig.weekdayDayStaff;
                      return (
                        <td key={i} className={`border p-1 text-center text-blue-700 ${count < minRequired ? 'bg-red-200 text-red-700' : count > minRequired + 2 ? 'bg-yellow-200 text-yellow-700' : ''}`}>
                          <div>{count}</div>
                          <div className="text-[9px] text-gray-400">/{minRequired}</div>
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <td className="border p-2 sticky left-0 bg-gray-100 z-30 text-gray-700">休日人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift === '休' || shift === '有') count++;
                      });
                      return (
                        <td key={i} className="border p-1 text-center text-gray-600">
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-amber-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-amber-50 z-30 text-amber-800">出勤計</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[i];
                        if (shift && shift !== '休' && shift !== '有' && shift !== '明') count++;
                      });
                      return (
                        <td key={i} className="border p-1 text-center text-amber-700">
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            {/* 統計サマリー */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">
                  {(() => {
                    let total = 0;
                    activeNurses.forEach(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      total += shifts.filter(s => s === '夜').length;
                    });
                    return total;
                  })()}
                </div>
                <div className="text-sm text-purple-600">夜勤総数</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {(() => {
                    let total = 0;
                    activeNurses.forEach(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      total += shifts.filter(s => s === '日').length;
                    });
                    return total;
                  })()}
                </div>
                <div className="text-sm text-blue-600">日勤総数</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">
                  {(() => {
                    const nightCounts = activeNurses.map(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      return shifts.filter(s => s === '夜').length;
                    });
                    return `${Math.min(...nightCounts)}〜${Math.max(...nightCounts)}`;
                  })()}
                </div>
                <div className="text-sm text-gray-600">夜勤回数(個人)</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">
                  {(() => {
                    const workCounts = activeNurses.map(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      return shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                    });
                    return `${Math.min(...workCounts)}〜${Math.max(...workCounts)}`;
                  })()}
                </div>
                <div className="text-sm text-amber-600">出勤日数(個人)</div>
              </div>
            </div>
            
            {/* 週別夜勤統計 */}
            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                <Moon size={18} />
                週別夜勤人数
              </h4>
              <div className="flex flex-wrap gap-3">
                {(() => {
                  // 週ごとの実際の夜勤人数を計算
                  const weeks = [];
                  const firstDay = new Date(targetYear, targetMonth, 1);
                  const firstDayOfWeek = firstDay.getDay();
                  let currentDay = 1;
                  let weekIndex = 0;
                  
                  const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
                  if (daysUntilSunday > 0) {
                    weeks.push({ start: 1, end: daysUntilSunday, weekNum: 1 });
                    currentDay = daysUntilSunday + 1;
                    weekIndex = 1;
                  }
                  
                  while (currentDay <= daysInMonth) {
                    const endDay = Math.min(currentDay + 6, daysInMonth);
                    weeks.push({ start: currentDay, end: endDay, weekNum: weekIndex + 1 });
                    currentDay = endDay + 1;
                    weekIndex++;
                  }
                  
                  return weeks.map((w, i) => {
                    // 週内の各日の夜勤人数を計算
                    let totalNightShifts = 0;
                    let daysCovered = 0;
                    for (let d = w.start - 1; d < w.end; d++) {
                      activeNurses.forEach(nurse => {
                        const shift = (scheduleDisplayData[nurse.id] || [])[d];
                        if (shift === '夜') totalNightShifts++;
                      });
                      daysCovered++;
                    }
                    const avgNight = daysCovered > 0 ? (totalNightShifts / daysCovered).toFixed(1) : 0;
                    
                    return (
                      <div key={i} className="bg-white rounded-lg px-4 py-2 text-center min-w-[100px]">
                        <div className="text-xs text-gray-500">第{w.weekNum}週</div>
                        <div className="text-xs text-gray-400">{w.start}〜{w.end}日</div>
                        <div className="text-xl font-bold text-purple-700">{avgNight}</div>
                        <div className="text-xs text-purple-600">人/日</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            
            {/* 個人別詳細統計 */}
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Users size={18} />
                個人別統計詳細
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">氏名</th>
                      <th className="border p-2 text-center bg-purple-50">夜勤</th>
                      <th className="border p-2 text-center bg-blue-50">日勤</th>
                      <th className="border p-2 text-center bg-pink-50">夜明</th>
                      <th className="border p-2 text-center bg-gray-200">公休</th>
                      <th className="border p-2 text-center bg-emerald-50">有休</th>
                      <th className="border p-2 text-center bg-amber-50">出勤計</th>
                      <th className="border p-2 text-center bg-orange-50">土日出勤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map(nurse => {
                      const shifts = scheduleDisplayData[nurse.id] || [];
                      const stats = {
                        night: shifts.filter(s => s === '夜').length,
                        day: shifts.filter(s => s === '日').length,
                        ake: shifts.filter(s => s === '明').length,
                        off: shifts.filter(s => s === '休').length,
                        paid: shifts.filter(s => s === '有').length,
                        work: shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length,
                        weekend: 0
                      };
                      
                      // 土日出勤をカウント
                      shifts.forEach((shift, i) => {
                        if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                          const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                          if (dow === '土' || dow === '日') {
                            stats.weekend++;
                          }
                        }
                      });
                      
                      return (
                        <tr key={nurse.id} className="hover:bg-gray-50">
                          <td className="border p-2 font-medium whitespace-nowrap">
                            <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                              {nurse.position.charAt(0)}
                            </span>
                            {nurse.name}
                          </td>
                          <td className="border p-2 text-center bg-purple-50 font-bold text-purple-700">{stats.night}</td>
                          <td className="border p-2 text-center bg-blue-50 font-bold text-blue-700">{stats.day}</td>
                          <td className="border p-2 text-center bg-pink-50 font-bold text-pink-700">{stats.ake}</td>
                          <td className="border p-2 text-center bg-gray-200 font-bold text-gray-700">{stats.off}</td>
                          <td className="border p-2 text-center bg-emerald-50 font-bold text-emerald-700">{stats.paid}</td>
                          <td className="border p-2 text-center bg-amber-50 font-bold text-amber-700">{stats.work}</td>
                          <td className="border p-2 text-center bg-orange-50 font-bold text-orange-700">{stats.weekend}</td>
                        </tr>
                      );
                    })}
                    {/* 合計行 */}
                    <tr className="bg-gray-100 font-bold">
                      <td className="border p-2">合計</td>
                      {(() => {
                        let totals = { night: 0, day: 0, ake: 0, off: 0, paid: 0, work: 0, weekend: 0 };
                        activeNurses.forEach(nurse => {
                          const shifts = scheduleDisplayData[nurse.id] || [];
                          totals.night += shifts.filter(s => s === '夜').length;
                          totals.day += shifts.filter(s => s === '日').length;
                          totals.ake += shifts.filter(s => s === '明').length;
                          totals.off += shifts.filter(s => s === '休').length;
                          totals.paid += shifts.filter(s => s === '有').length;
                          totals.work += shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                          shifts.forEach((shift, i) => {
                            if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                              const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                              if (dow === '土' || dow === '日') totals.weekend++;
                            }
                          });
                        });
                        return (
                          <>
                            <td className="border p-2 text-center bg-purple-100">{totals.night}</td>
                            <td className="border p-2 text-center bg-blue-100">{totals.day}</td>
                            <td className="border p-2 text-center bg-pink-100">{totals.ake}</td>
                            <td className="border p-2 text-center bg-gray-300">{totals.off}</td>
                            <td className="border p-2 text-center bg-emerald-100">{totals.paid}</td>
                            <td className="border p-2 text-center bg-amber-100">{totals.work}</td>
                            <td className="border p-2 text-center bg-orange-100">{totals.weekend}</td>
                          </>
                        );
                      })()}
                    </tr>
                    {/* 平均行 */}
                    <tr className="bg-gray-50">
                      <td className="border p-2 text-gray-600">平均</td>
                      {(() => {
                        const n = activeNurses.length;
                        let totals = { night: 0, day: 0, ake: 0, off: 0, paid: 0, work: 0, weekend: 0 };
                        activeNurses.forEach(nurse => {
                          const shifts = scheduleDisplayData[nurse.id] || [];
                          totals.night += shifts.filter(s => s === '夜').length;
                          totals.day += shifts.filter(s => s === '日').length;
                          totals.ake += shifts.filter(s => s === '明').length;
                          totals.off += shifts.filter(s => s === '休').length;
                          totals.paid += shifts.filter(s => s === '有').length;
                          totals.work += shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                          shifts.forEach((shift, i) => {
                            if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                              const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                              if (dow === '土' || dow === '日') totals.weekend++;
                            }
                          });
                        });
                        return (
                          <>
                            <td className="border p-2 text-center text-purple-600">{(totals.night / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-blue-600">{(totals.day / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-pink-600">{(totals.ake / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-gray-600">{(totals.off / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-emerald-600">{(totals.paid / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-amber-600">{(totals.work / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-orange-600">{(totals.weekend / n).toFixed(1)}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          );
        })()}

        {/* アクセスコード発行モーダル */}
        {showAccessCodes && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">アクセスコード一覧</h3>
                <button
                  onClick={() => setShowAccessCodes(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>使い方：</strong>各職員にコードを伝えてください。
                  職員はトップ画面から「職員用（休み希望入力）」を選び、コードを入力します。
                  <br />
                  <strong>※コードは職員名から自動生成されるため、常に同じコードが使用できます。</strong>
                </p>
              </div>
              
              <button
                onClick={copyAllCodes}
                className="mb-4 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg self-start transition-colors"
              >
                全員分をコピー
              </button>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {nursesWithCodes.map(nurse => (
                  <div
                    key={nurse.id}
                    className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-lg border ${POSITIONS[nurse.position]?.color}`}>
                        {nurse.position}
                      </span>
                      <span className="font-medium">{nurse.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono font-bold text-xl px-4 py-2 bg-white border-2 rounded-lg">
                        {nurse.accessCode}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(nurse.accessCode);
                          alert(`${nurse.name}さんのコードをコピーしました: ${nurse.accessCode}`);
                        }}
                        className="px-3 py-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg text-sm transition-colors"
                      >
                        コピー
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>
        )}


        {/* 希望確認モーダル（確認・消去のみ） */}
        {showRequestReview && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">希望一覧（{targetYear}年{targetMonth + 1}月）</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await reloadRequestsFromDB();
                      alert('✅ 最新の希望データを読み込みました');
                    }}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw size={14} />
                    DB再読込
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('⚠️ この月の全職員の希望データをDBから完全に削除しますか？\n\n削除後、職員に再入力を依頼してください。')) return;
                      try {
                        const { error } = await supabase.from('hcu_requests').delete()
                          .eq('year', targetYear).eq('month', targetMonth);
                        if (error) throw error;
                        setRequests(prev => {
                          const updated = { ...prev };
                          delete updated[`${targetYear}-${targetMonth}`];
                          return updated;
                        });
                        setOriginalRequests({});
                        alert('✅ 全希望データを削除しました。');
                      } catch (e: any) {
                        alert('❌ 削除エラー: ' + (e?.message || '不明'));
                      }
                    }}
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    全希望消去
                  </button>
                  <button onClick={() => setShowRequestReview(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 確認専用：</strong>希望の編集は勤務表画面で直接行ってください。ここでは確認と一括消去のみ可能です。
                </p>
              </div>

              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100">
                      <th className="border p-2 sticky left-0 bg-gray-100 z-20 whitespace-nowrap">氏名</th>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const dow = getDayOfWeek(targetYear, targetMonth, day);
                        return (
                          <th key={day} className={`border p-1 min-w-[32px] ${dow === '土' ? 'bg-blue-50' : dow === '日' ? 'bg-red-50' : 'bg-gray-100'}`}>
                            <div className={`text-xs ${dow === '日' ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>{dow}</div>
                            <div>{day}</div>
                          </th>
                        );
                      })}
                      <th className="border p-2 bg-gray-100">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map((nurse: any) => {
                      const nurseIdKey = String(nurse.id);
                      const nurseReqs = monthRequests[nurseIdKey] || {};
                      const constraints = prevMonthConstraints[nurse.id] || {};
                      const requestCount = Object.keys(nurseReqs).length;
                      return (
                        <tr key={nurse.id} className="hover:bg-gray-50">
                          <td className="border p-2 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                            <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>{nurse.position.charAt(0)}</span>
                            {nurse.name}
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const req = nurseReqs[day];
                            const con = constraints[day];
                            return (
                              <td key={day} className={`border p-1 text-center ${
                                req === '休' ? 'bg-gray-200' :
                                req === '有' ? 'bg-emerald-100' :
                                req === '前' ? 'bg-orange-100' :
                                req === '後' ? 'bg-amber-100' :
                                req === '日' ? 'bg-blue-100' :
                                req === '夜' ? 'bg-purple-100' :
                                req === '明' ? 'bg-pink-100' :
                                con ? 'bg-orange-50' : ''
                              }`}>
                                {req && <div className="font-medium text-xs">{req}</div>}
                                {!req && con && <div className="text-[10px] text-orange-500">{con}</div>}
                              </td>
                            );
                          })}
                          <td className="border p-1 text-center font-bold">{requestCount}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-50 font-bold">
                      <td className="border p-2 sticky left-0 bg-amber-50 z-10">希望人数</td>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        let count = 0;
                        Object.values(monthRequests).forEach((reqs: any) => { if (reqs[day]) count++; });
                        return (
                          <td key={day} className={`border p-1 text-center ${count >= 3 ? 'text-red-600 bg-red-100' : ''}`}>
                            {count || ''}
                          </td>
                        );
                      })}
                      <td className="border p-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-4">
                <button onClick={() => setShowRequestReview(false)} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors">
                  閉じる
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
        {/* 看護師追加モーダル */}
        {showAddNurse && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md my-4">
              <h3 className="text-xl font-bold mb-4">職員を追加</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">氏名</label>
                  <input
                    type="text"
                    value={newNurseData.name}
                    onChange={(e) => setNewNurseData({ ...newNurseData, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                    placeholder="例：山田 花子"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職</label>
                  <select
                    value={newNurseData.position}
                    onChange={(e) => setNewNurseData({ ...newNurseData, position: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                  >
                    {Object.keys(POSITIONS).map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddNurse(false);
                    setNewNurseData({ name: '', position: '一般' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={addNurse}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  追加
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Excel読み込みモーダル */}
        {showExcelImport && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Excelから職員情報を読み込み</h3>
                <button
                  onClick={() => {
                    setShowExcelImport(false);
                    setExcelData(null);
                    setExcelPreview([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
                <div>
                  <label className="block text-sm font-medium mb-1">開始行</label>
                  <input
                    type="number"
                    min="1"
                    value={importConfig.startRow}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, startRow: parseInt(e.target.value) || 1 };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">終了行</label>
                  <input
                    type="number"
                    min="1"
                    value={importConfig.endRow}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, endRow: parseInt(e.target.value) || 30 };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">氏名列</label>
                  <input
                    type="text"
                    value={importConfig.nameColumn}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, nameColumn: e.target.value.toUpperCase() };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="C"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職列</label>
                  <input
                    type="text"
                    value={importConfig.positionColumn}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, positionColumn: e.target.value.toUpperCase() };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="D"
                  />
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold mb-3">プレビュー（{excelPreview.length}名）</h4>
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm">行</th>
                        <th className="px-4 py-2 text-left text-sm">氏名</th>
                        <th className="px-4 py-2 text-left text-sm">役職</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                            データが見つかりません
                          </td>
                        </tr>
                      ) : (
                        excelPreview.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-4 py-2 text-sm">{item.row}</td>
                            <td className="px-4 py-2 text-sm font-medium">{item.name}</td>
                            <td className="px-4 py-2 text-sm">{item.position}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800">
                  <strong>注意：</strong>「反映」をクリックすると、現在の職員リストが上書きされます。
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowExcelImport(false);
                    setExcelData(null);
                    setExcelPreview([]);
                  }}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={applyExcelImport}
                  disabled={excelPreview.length === 0}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  反映
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* 削除確認モーダル */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm my-4">
                <div className="text-center mb-6">
                  <div className="bg-red-100 p-4 rounded-full inline-block mb-4">
                    <Trash2 className="text-red-600 pointer-events-none" size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">削除の確認</h3>
                  <p className="text-gray-600">
                    <span className="font-semibold">{deleteConfirm.name}</span>さんを削除しますか？
                  </p>
                  <p className="text-sm text-red-500 mt-2">この操作は取り消せません</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteNurse(deleteConfirm.id);
                      setDeleteConfirm(null);
                    }}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    削除する
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 前月データ読み込みモーダル */}
        {showPrevMonthImport && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">前月勤務表の読み込み</h3>
                  <button
                    type="button"
                    onClick={() => setShowPrevMonthImport(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                  <p className="text-sm text-orange-800">
                    <strong>目的：</strong>前月末の勤務状況（夜勤・夜勤明けなど）を読み込み、
                    当月初の勤務を自動で調整します。
                  </p>
                  <ul className="text-sm text-orange-700 mt-2 space-y-1">
                    <li>• 前月末が夜勤 → 1日目は夜勤明け、2日目は休み</li>
                    <li>• 前月末が夜勤明け → 1日目は休み</li>
                    <li>• 連続勤務4日以上 → 1日目は休み</li>
                  </ul>
                </div>
                
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">前月の勤務表（Excel）を選択</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handlePrevMonthUpload}
                      className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
                    />
                  </label>
                  
                  {previousMonthData && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-sm text-green-800 font-medium">
                        ✅ 前月データ確定済み（{Object.keys(previousMonthData).filter(id => previousMonthData[id] && previousMonthData[id].length > 0).length}名分）
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPrevMonthImport(false);
                            setShowPrevMonthReview(true);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                        >
                          データを確認
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearPreviousMonthData();
                          }}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors"
                        >
                          クリア
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end mt-6">
                  <button
                    type="button"
                    onClick={() => setShowPrevMonthImport(false)}
                    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 職員別シフト設定モーダル */}
        {showNurseShiftPrefs && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">🌙 職員別シフト設定</h3>
                  <button onClick={() => setShowNurseShiftPrefs(false)} className="p-2 hover:bg-gray-100 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>💡 説明：</strong>職員ごとに夜勤の最大回数や、日勤なし・夜勤なしの希望を設定できます。
                    自動生成時にこの設定が反映されます。
                    未設定の場合は共通設定（最大{generateConfig.maxNightShifts}回）が適用されます。
                  </p>
                </div>

                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-2 text-left">氏名</th>
                        <th className="border p-2 text-center">役職</th>
                        <th className="border p-2 text-center">夜勤上限</th>
                        <th className="border p-2 text-center">夜勤なし</th>
                        <th className="border p-2 text-center">日勤なし</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeNurses.map((nurse: any) => {
                        const pref = nurseShiftPrefs[nurse.id] || { maxNightShifts: generateConfig.maxNightShifts, noNightShift: false, noDayShift: false };
                        return (
                          <tr key={nurse.id} className="hover:bg-gray-50">
                            <td className="border p-2 font-medium whitespace-nowrap">
                              <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                {nurse.position.charAt(0)}
                              </span>
                              {nurse.name}
                            </td>
                            <td className="border p-2 text-center text-xs">{nurse.position}</td>
                            <td className="border p-2 text-center">
                              <select
                                value={pref.noNightShift ? 0 : pref.maxNightShifts}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, maxNightShifts: val, noNightShift: val === 0 }
                                  }));
                                }}
                                className="px-2 py-1 border rounded text-center w-16"
                              >
                                {Array.from({ length: 11 }, (_, i) => (
                                  <option key={i} value={i}>{i === 0 ? '0 (なし)' : `${i}回`}</option>
                                ))}
                              </select>
                            </td>
                            <td className="border p-2 text-center">
                              <input
                                type="checkbox"
                                checked={pref.noNightShift}
                                onChange={(e) => {
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, noNightShift: e.target.checked, maxNightShifts: e.target.checked ? 0 : generateConfig.maxNightShifts }
                                  }));
                                }}
                                className="w-5 h-5 text-purple-600 rounded"
                              />
                            </td>
                            <td className="border p-2 text-center">
                              <input
                                type="checkbox"
                                checked={pref.noDayShift}
                                onChange={(e) => {
                                  setNurseShiftPrefs(prev => ({
                                    ...prev,
                                    [nurse.id]: { ...pref, noDayShift: e.target.checked }
                                  }));
                                }}
                                className="w-5 h-5 text-blue-600 rounded"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between mt-4">
                  <button
                    onClick={() => {
                      setNurseShiftPrefs({});
                      saveSettingToDB('nurseShiftPrefs', JSON.stringify({}))
                        .catch(e => console.error('職員設定リセットエラー:', e));
                    }}
                    className="px-4 py-2 text-gray-500 hover:text-red-500 text-sm"
                  >
                    すべてリセット
                  </button>
                  <button
                    onClick={() => {
                      saveSettingToDB('nurseShiftPrefs', JSON.stringify(nurseShiftPrefs))
                        .catch(e => console.error('職員設定保存エラー:', e));
                      setShowNurseShiftPrefs(false);
                    }}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    設定を保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 勤務表生成設定モーダル */}
        {showGenerateConfig && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">⚙️ 勤務表生成設定</h3>
                  <button
                    type="button"
                    onClick={() => setShowGenerateConfig(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* 週ごとの夜勤人数設定 */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                      <Moon size={20} />
                      週ごとの夜勤人数（隔週交互）
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">奇数週（第1, 3, 5週）</label>
                        <select
                          value={generateConfig.nightShiftPattern[generateConfig.startWithThree ? 0 : 1]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGenerateConfig(prev => ({
                              ...prev,
                              nightShiftPattern: generateConfig.startWithThree ? [val, prev.nightShiftPattern[1]] : [prev.nightShiftPattern[0], val]
                            }));
                          }}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          <option value={2}>2人</option>
                          <option value={3}>3人</option>
                          <option value={4}>4人</option>
                          <option value={5}>5人</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">偶数週（第2, 4週）</label>
                        <select
                          value={generateConfig.nightShiftPattern[generateConfig.startWithThree ? 1 : 0]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGenerateConfig(prev => ({
                              ...prev,
                              nightShiftPattern: generateConfig.startWithThree ? [prev.nightShiftPattern[0], val] : [val, prev.nightShiftPattern[1]]
                            }));
                          }}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          <option value={2}>2人</option>
                          <option value={3}>3人</option>
                          <option value={4}>4人</option>
                          <option value={5}>5人</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* 週のプレビュー */}
                    <div className="bg-white rounded-lg p-3 text-sm">
                      <p className="font-medium mb-2">{targetYear}年{targetMonth + 1}月のプレビュー:</p>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const weeks = [];
                          const firstDay = new Date(targetYear, targetMonth, 1);
                          const firstDayOfWeek = firstDay.getDay();
                          let currentDay = 1;
                          let weekIndex = 0;
                          
                          // 第1週（月初から最初の日曜日まで）
                          const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
                          if (daysUntilSunday > 0) {
                            const count = generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1];
                            weeks.push({ start: 1, end: daysUntilSunday, count, weekNum: 1 });
                            currentDay = daysUntilSunday + 1;
                            weekIndex = 1;
                          }
                          
                          while (currentDay <= daysInMonth) {
                            const patternIndex = generateConfig.startWithThree ? (weekIndex % 2) : ((weekIndex + 1) % 2);
                            const count = generateConfig.nightShiftPattern[patternIndex];
                            const endDay = Math.min(currentDay + 6, daysInMonth);
                            weeks.push({ start: currentDay, end: endDay, count, weekNum: weekIndex + 1 });
                            currentDay = endDay + 1;
                            weekIndex++;
                          }
                          
                          return weeks.map((w, i) => (
                            <span key={i} className={`px-3 py-1 rounded-full text-xs font-medium ${
                              w.count === 3 ? 'bg-blue-100 text-blue-700' : 
                              w.count === 4 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {w.start}-{w.end}日: {w.count}人
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* その他の設定 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <h4 className="font-bold text-gray-800 mb-3">その他の制約</h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大夜勤回数</label>
                        <select
                          value={generateConfig.maxNightShifts}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxNightShifts: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[4, 5, 6, 7, 8].map(n => (
                            <option key={n} value={n}>{n}回</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最小休日数</label>
                        <select
                          value={generateConfig.minDaysOff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, minDaysOff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n}日</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大連続勤務</label>
                        <select
                          value={generateConfig.maxConsecutiveDays}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxConsecutiveDays: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[4, 5, 6, 7].map(n => (
                            <option key={n} value={n}>{n}日</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  {/* 日勤者数設定 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                      <Sun size={20} />
                      日勤者数の設定
                    </h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">平日</label>
                        <select
                          value={generateConfig.weekdayDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, weekdayDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 7).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">土日・祝日</label>
                        <select
                          value={generateConfig.weekendDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, weekendDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 9 }, (_, i) => i + 7).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">年末(12/30-31)</label>
                        <select
                          value={generateConfig.yearEndDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, yearEndDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 11 }, (_, i) => i + 5).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">年始(1/1-3)</label>
                        <select
                          value={generateConfig.newYearDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, newYearDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 11 }, (_, i) => i + 5).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-xs text-blue-600">
                      ※ 年末年始設定は12月・1月の勤務表生成時に適用されます
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-6">
                  <button
                    type="button"
                    onClick={() => setShowGenerateConfig(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={generateSchedule}
                    disabled={generating}
                    className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={`inline mr-2 ${generating ? 'animate-spin' : ''}`} />
                    {generating ? '生成中...' : 'この設定で生成'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 前月データ確認モーダル（マッピング編集UI） */}
        {showPrevMonthReview && (prevMonthRawData.length > 0 || previousMonthData) && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">
                    {prevMonthRawData.length > 0 ? '📋 前月データのマッピング設定' : '✅ 確定済み前月データ'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (prevMonthRawData.length > 0) {
                        cancelPreviousMonthPreview();
                      } else {
                        setShowPrevMonthReview(false);
                      }
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                {prevMonthRawData.length > 0 ? (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-amber-800">
                        <strong>⚠️ 各職員に対応するExcelの行を選択してください。</strong>
                        <br />
                        システム登録の職員名とExcelの氏名が異なる場合は、ドロップダウンから正しい行を選択してください。
                      </p>
                    </div>
                    
                    <div className="overflow-auto max-h-[55vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="border p-2 text-left min-w-[120px]">システム職員</th>
                            <th className="border p-2 text-left min-w-[200px]">Excelデータ選択</th>
                            <th className="border p-2 text-center bg-gray-50" colSpan={7}>前月末（7日分）</th>
                            <th className="border p-2 text-center bg-orange-100" colSpan={3}>当月制約</th>
                          </tr>
                          <tr>
                            <th className="border p-2"></th>
                            <th className="border p-2"></th>
                            {[7, 6, 5, 4, 3, 2, 1].map(d => (
                              <th key={d} className="border p-1 text-center text-xs text-gray-500">{d}日前</th>
                            ))}
                            <th className="border p-1 text-center text-xs bg-orange-50">1日</th>
                            <th className="border p-1 text-center text-xs bg-orange-50">2日</th>
                            <th className="border p-1 text-center text-xs bg-orange-50">3日</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNurses.map(nurse => {
                            const mappedIndex = prevMonthMapping[nurse.id];
                            const mappedData = mappedIndex !== undefined ? prevMonthRawData[mappedIndex] : null;
                            const shifts = mappedData ? mappedData.shifts : [];
                            const paddedShifts = [...Array(7 - shifts.length).fill(''), ...shifts];
                            
                            // 制約をリアルタイム計算
                            const constraints = {};
                            if (shifts.length > 0) {
                              const lastShift = shifts[shifts.length - 1];
                              const secondLastShift = shifts.length > 1 ? shifts[shifts.length - 2] : '';
                              const thirdLastShift = shifts.length > 2 ? shifts[shifts.length - 3] : '';
                              
                              if (lastShift === '夜') {
                                constraints[0] = '明';
                                constraints[1] = '休';
                                if (thirdLastShift === '夜' && secondLastShift === '明') {
                                  constraints[2] = '休';
                                }
                              } else if (lastShift === '明') {
                                constraints[0] = '休';
                                if (secondLastShift === '夜' && shifts.length >= 4 && 
                                    shifts[shifts.length - 4] === '夜' && shifts[shifts.length - 3] === '明') {
                                  constraints[1] = '休';
                                }
                              }
                              
                              // 連続勤務チェック
                              let consecutiveWork = 0;
                              for (let i = shifts.length - 1; i >= 0; i--) {
                                const s = shifts[i];
                                if (s && s !== '休' && s !== '有' && s !== '明') {
                                  consecutiveWork++;
                                } else {
                                  break;
                                }
                              }
                              if (consecutiveWork >= 4 && !constraints[0]) {
                                constraints[0] = '休';
                              }
                            }
                            
                            return (
                              <tr key={nurse.id} className={`hover:bg-gray-50 ${!mappedData ? 'bg-yellow-50' : ''}`}>
                                <td className="border p-2 font-medium whitespace-nowrap">
                                  <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                    {nurse.position}
                                  </span>
                                  {nurse.name}
                                </td>
                                <td className="border p-2">
                                  <select
                                    value={mappedIndex !== undefined ? mappedIndex : ''}
                                    onChange={(e) => updateMapping(nurse.id, e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  >
                                    <option value="">-- 選択してください --</option>
                                    {prevMonthRawData.map((row, idx) => (
                                      <option key={idx} value={idx}>
                                        {idx + 1}. {row.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                {paddedShifts.map((shift, i) => (
                                  <td key={i} className={`border p-1 text-center ${
                                    shift === '夜' ? 'bg-purple-100 text-purple-800' :
                                    shift === '明' ? 'bg-pink-100 text-pink-800' :
                                    shift === '休' || shift === '有' ? 'bg-gray-300' :
                                    shift === '日' ? 'bg-blue-50 text-blue-800' : ''
                                  }`}>
                                    {shift || '-'}
                                  </td>
                                ))}
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[0] === '明' ? 'text-pink-600' :
                                  constraints[0] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[0] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[1] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[1] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[2] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[2] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* 統計情報 */}
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex gap-6 flex-wrap">
                        <span>Excel読み込み件数: <strong>{prevMonthRawData.length}名</strong></span>
                        <span>マッピング済み: <strong className="text-green-600">
                          {Object.values(prevMonthMapping).filter(v => v !== undefined).length}名
                        </strong></span>
                        <span>未設定: <strong className="text-yellow-600">
                          {activeNurses.length - Object.values(prevMonthMapping).filter(v => v !== undefined).length}名
                        </strong></span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-6">
                      <button
                        type="button"
                        onClick={cancelPreviousMonthPreview}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={confirmPreviousMonthData}
                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                      >
                        ✓ 確定する
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-green-800">
                        <strong>✅ 確定済み</strong> - 「自動生成」ボタンを押すと、この制約が適用されます。
                      </p>
                    </div>
                    
                    <div className="overflow-auto max-h-[55vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="border p-2 text-left">職員名</th>
                            <th className="border p-2 text-center bg-gray-50" colSpan={7}>前月末（7日分）</th>
                            <th className="border p-2 text-center bg-orange-100" colSpan={3}>当月制約</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNurses.map(nurse => {
                            const shifts = previousMonthData[nurse.id] || [];
                            const paddedShifts = [...Array(7 - shifts.length).fill(''), ...shifts];
                            const constraints = prevMonthConstraints[nurse.id] || {};
                            
                            return (
                              <tr key={nurse.id} className={`hover:bg-gray-50 ${shifts.length === 0 ? 'bg-gray-100' : ''}`}>
                                <td className="border p-2 font-medium whitespace-nowrap">
                                  <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                    {nurse.position}
                                  </span>
                                  {nurse.name}
                                </td>
                                {paddedShifts.map((shift, i) => (
                                  <td key={i} className={`border p-1 text-center ${
                                    shift === '夜' ? 'bg-purple-100 text-purple-800' :
                                    shift === '明' ? 'bg-pink-100 text-pink-800' :
                                    shift === '休' || shift === '有' ? 'bg-gray-300' :
                                    shift === '日' ? 'bg-blue-50 text-blue-800' : ''
                                  }`}>
                                    {shift || '-'}
                                  </td>
                                ))}
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[1] === '明' ? 'text-pink-600' :
                                  constraints[1] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[1] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[2] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[2] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[3] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[3] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="flex justify-between items-center mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          clearPreviousMonthData();
                          setShowPrevMonthReview(false);
                        }}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                      >
                        データをクリア
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPrevMonthReview(false)}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                      >
                        閉じる
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HcuScheduleSystem;
