from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, String, Integer, DateTime
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import math
import os
import json
import gspread
from sqlalchemy import create_engine
from oauth2client.service_account import ServiceAccountCredentials
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

# =====================
# DATABASE (RAILWAY)
# =====================
DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)

# =====================
# FASTAPI
# =====================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount frontend folder
app.mount("/frontend", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../frontend")), name="frontend")

# =====================
# GOOGLE SHEETS (ENV)
# =====================
SCOPE = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

def get_gs_client():
    creds_dict = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    creds = ServiceAccountCredentials.from_json_keyfile_dict(
        creds_dict, SCOPE
    )
    return gspread.authorize(creds)

def update_database_from_gs():
    try:
        client = get_gs_client()
        sheet = client.open_by_url(
            "https://docs.google.com/spreadsheets/d/1jjmHulvvmEJ5353S5kDaS4i1x6UAhz5w6R9TVDa0t6o/edit"
        ).sheet1

        df = pd.DataFrame(sheet.get_all_records())
        if df.empty:
            print("Sheet kosong")
            return False

        # Normalisasi kolom
        df.columns = (
            df.columns
            .str.strip()
            .str.lower()
            .str.replace(" ", "_")
            .str.replace(".", "", regex=False)
            .str.replace("/", "_")
            .str.replace("+", "_plus")
        )

        df = df.rename(columns={
            "claim_c1__c2": "claim_c1_c2",
            "g_oli__plus": "g_oli_plus",
            "part": "part_total"   
        })

        numeric_cols = [
            "unit_entri","kpb_1","kpb_2","kpb_3","kpb_4",
            "claim_c1_c2","p_lengkap","p_ringan","g_oli_plus",
            "total_jasa","part_total","total_sparepart","target"
        ]

        for col in numeric_cols:
            if col in df.columns:
                df[col] = df[col].astype(str).str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        # Konversi tanggal
        df["tanggal"] = pd.to_datetime(df["tanggal"], errors="coerce")

        # Upload ke Neon (AUTO CREATE TABLE)
        with engine.begin() as conn:
            df.to_sql(
                "entri_harian",
                conn,
                if_exists="replace",  # replace table lama
                index=False,
                dtype={
                    "nama": String,
                    "hari": String,
                    "tanggal": DateTime,
                    "unit_entri": Integer,
                    "kpb_1": Integer,
                    "kpb_2": Integer,
                    "kpb_3": Integer,
                    "kpb_4": Integer,
                    "claim_c1_c2": Integer,
                    "p_lengkap": Integer,
                    "p_ringan": Integer,
                    "g_oli_plus": Integer,
                    "total_jasa": Integer,
                    "part_total": Integer,
                    "total_sparepart": Integer,
                    "target": Integer
                },
                method="multi"
            )

        print("Data berhasil diupload ke Neon")
        return True
    except Exception as e:
        print("Error update_database_from_gs:", e)
        return False
    
def update_penjualan_from_gs():
    try:
        client = get_gs_client()
        sheet = client.open_by_key(
            "1YhFv5B02bsmvoXYCVBfVL9bFEC2Y67xMnrjyNhwWzPQ"
        ).worksheet("sheet1") 

        df = pd.DataFrame(sheet.get_all_records())
        if df.empty:
            print("Sheet penjualan kosong")
            return False

        # Normalisasi kolom
        df.columns = (
            df.columns
            .str.strip()
            .str.lower()
            .str.replace(" ", "_")
            .str.replace("(", "", regex=False)
            .str.replace(")", "", regex=False)
            .str.replace(".", "", regex=False)
        )

        df = df.rename(columns={
            "tglinvoice": "tgl_invoice",
            "disc_nonppn": "disc_non_ppn",
            "har_ga": "harga",
            "d_p_p": "dpp",
            "p_p_n": "ppn",
            "b_b_n": "bbn"
        })

        # Konversi tanggal
        for col in ["tgl_invoice", "tanggal_so"]:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors="coerce")

        # Upload ke DB
        with engine.begin() as conn:
            df.to_sql(
                "penjualan",
                conn,
                if_exists="replace",
                index=False,
                method="multi"
            )

        print("Penjualan berhasil diupdate")
        return True

    except Exception as e:
        print("Error update_penjualan:", e)
        return False

def update_kpb_12_from_gs():
    try:
        client = get_gs_client()
        sheet = client.open_by_key(
            "1SMyPtlFLkgJtBuNp7YoDxaAhjJmbBSPiyyVA5SLXLlM"
        ).sheet1

        df = pd.DataFrame(sheet.get_all_records())
        if df.empty:
            print("Sheet KPB 1 & 2 kosong")
            return False

        df.columns = (
            df.columns
            .str.strip()
            .str.lower()
            .str.replace(" ", "_")
            .str.replace(".", "", regex=False)
            .str.replace("(", "", regex=False)
            .str.replace(")", "", regex=False)
        )

        df = df.rename(columns={
            "no": "no_urut",
            "tgl_service": "tanggal_service",
            "tgl_selesai": "tanggal_selesai",
            "lead_time_menit": "lead_time"
        })

        for col in ["tanggal_service", "tanggal_selesai", "service_terakhir"]:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors="coerce")

        if "lead_time" in df.columns:
            df["lead_time"] = pd.to_numeric(df["lead_time"], errors="coerce").fillna(0)

        with engine.begin() as conn:
            df.to_sql(
                "kpb_12_service",
                conn,
                if_exists="replace",
                index=False,
                method="multi"
            )

        print("KPB 1 & 2 berhasil diupdate")
        return True

    except Exception as e:
        print("Error update KPB 1 & 2:", e)
        return False

# === UTILITY FUNCTIONS ===
def safe_top(df, col):
    if df.empty:
        return {"label": "-", "jumlah": 0}
    temp = df.groupby(col)["unit_entri"].sum().reset_index(name="jumlah").sort_values("jumlah", ascending=False)
    return {"label": temp.iloc[0][col], "jumlah": int(temp.iloc[0]["jumlah"])}

def apply_global_filter(df, nama=None, hari=None):
    if nama:
        df = df[df["nama"].str.strip().str.lower() == nama.strip().lower()]
    if hari:
        df = df[df["hari"].str.strip().str.lower() == hari.strip().lower()]
    return df

def apply_date_filter(df, start_date=None, end_date=None):
    df = df.copy()
    df["tanggal"] = pd.to_datetime(df["tanggal"], errors="coerce")
    if start_date:
        start = pd.to_datetime(start_date, errors="coerce").normalize()
        df = df[df["tanggal"] >= start]
    if end_date:
        end = pd.to_datetime(end_date, errors="coerce").normalize()
        df = df[df["tanggal"] <= end]
    return df

def filter_visual(df, col):
    return df[df[col].notna() & (df[col] != "") & (df[col] != 0) & (df[col] != "0")]

def clean_df_for_json(df, value_cols=None):
    """
    Bersihkan NaN, Inf, -Inf, dan ubah ke float.
    value_cols: list kolom numerik. Kalau None, pakai ["jumlah"] default.
    """
    df = df.copy()
    if value_cols is None:
        value_cols = ["jumlah"]
    elif isinstance(value_cols, str):
        value_cols = [value_cols]
    for col in value_cols:
        if col in df.columns:
            df[col] = df[col].replace([float('inf'), float('-inf')], 0)
            df[col] = df[col].fillna(0).infer_objects(copy=False)
            df[col] = df[col].astype(float)
    return df

def safe_number(x):
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return 0
    return x

@app.get("/filters")
def get_filters():
    df = pd.read_sql("SELECT nama, hari FROM entri_harian WHERE tanggal IS NOT NULL", engine)
    return {
        "nama": sorted(df["nama"].dropna().unique().tolist()),
        "hari": sorted(df["hari"].dropna().unique().tolist())
    }

@app.post("/refresh")
def refresh_data():
    ok = update_database_from_gs()
    if ok:
        return {"status": "success", "message": "Data berhasil diperbarui"}
    else:
        raise HTTPException(status_code=500, detail="Gagal update data")

@app.post("/refresh-penjualan")
def refresh_penjualan():
    ok = update_penjualan_from_gs()
    if ok:
        return {"status": "success", "message": "Data penjualan diperbarui"}
    raise HTTPException(status_code=500, detail="Gagal update penjualan")

@app.post("/refresh-kpb-12")
def refresh_kpb_12():
    ok = update_kpb_12_from_gs()
    if ok:
        return {"status": "success", "message": "Data KPB 1 & 2 berhasil diperbarui"}
    raise HTTPException(status_code=500, detail="Gagal update data KPB 1 & 2")

@app.get("/overview")
def overview(
    nama: str | None = None,
    hari: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None
):
    # LOAD DATA
    df = pd.read_sql(
        '''
        SELECT 
            tanggal, nama, hari, unit_entri,
            kpb_1, kpb_2, kpb_3, kpb_4,
            "claim_c1___c2", p_lengkap, p_ringan, g_oli_plus,
            total_jasa, part_total, total_sparepart, target
        FROM entri_harian
        ''',
        engine
    )

    df["tanggal"] = pd.to_datetime(df["tanggal"])

    # FILTER GLOBAL & TANGGAL
    df = apply_global_filter(df, nama, hari)
    df = apply_date_filter(df, start_date, end_date)

    if df.empty:
        return {"message": "Data tidak tersedia"}
 
    # RENTANG FILTER AKTUAL
    start_filter = df["tanggal"].min()
    end_filter = df["tanggal"].max()
    delta_days = (end_filter - start_filter).days + 1

    # HITUNG PERIODE LALU
    start_lalu = start_filter - pd.DateOffset(months=1)
    end_lalu = start_lalu + pd.Timedelta(days=delta_days - 1)

    # DATA SEKARANG
    df_sekarang = df[
        (df["tanggal"] >= start_filter) &
        (df["tanggal"] <= end_filter)
    ]

    # DATA LALU (FULL DB)
    df_all = pd.read_sql(
        '''
        SELECT 
            tanggal, nama, hari, unit_entri,
            kpb_1, kpb_2, kpb_3, kpb_4,
            "claim_c1___c2", p_lengkap, p_ringan, g_oli_plus
        FROM entri_harian
        WHERE tanggal IS NOT NULL
        ''',
        engine
    )
    df_all["tanggal"] = pd.to_datetime(df_all["tanggal"])

    df_lalu = df_all[
        (df_all["tanggal"] >= start_lalu) &
        (df_all["tanggal"] <= end_lalu)
    ]

    # filter global tetap konsisten
    df_lalu = apply_global_filter(df_lalu, nama, hari)

    # STATISTIK UTAMA
    pakai_filter_tanggal = start_date is not None or end_date is not None

    if not pakai_filter_tanggal:
        # MODE TANPA FILTER TANGGAL
        total_sekarang = int(df["unit_entri"].sum())
        total_lalu = 0
        selisih = 0
        status = "tetap"
    else:
        # MODE PERBANDINGAN
        total_sekarang = int(df_sekarang["unit_entri"].sum())
        total_lalu = int(df_lalu["unit_entri"].sum()) if not df_lalu.empty else 0

        selisih = total_sekarang - total_lalu
        if selisih > 0:
            status = "naik"
        elif selisih < 0:
            status = "turun"
        else:
            status = "tetap"

    # RATA-RATA HARI AKTIF
    daily_sum = df_sekarang.groupby("tanggal")["unit_entri"].sum()
    valid_days = daily_sum[daily_sum > 0]
    rata_unit = float(valid_days.mean()) if not valid_days.empty else 0

    # TARGET DYNAMIC
    if not df.empty:
        if pakai_filter_tanggal or nama or hari:
            # ambil target dari baris pertama hasil filter
            target = int(df.iloc[0]["target"])
        else:
            # ambil target dari baris terakhir di DB
            target = int(df["target"].iloc[-1])
    else:
        target = 0

    # Prediksi per bulan 
    from calendar import monthrange
    today = pd.Timestamp.now()
    month = today.month
    year = today.year
    df_bulan_ini = df[(df["tanggal"].dt.month == month) & (df["tanggal"].dt.year == year)]
    daily_sum_bulan_ini = df_bulan_ini.groupby(df_bulan_ini["tanggal"].dt.normalize())["unit_entri"].sum()
    valid_days_bulan_ini = daily_sum_bulan_ini[daily_sum_bulan_ini > 0]
    rata_per_hari = float(valid_days_bulan_ini.sum() / valid_days_bulan_ini.count()) if valid_days_bulan_ini.count() > 0 else 0
    last_day_in_data = df_bulan_ini["tanggal"].dt.day.max() if not df_bulan_ini.empty else 0
    sisa_hari = max(monthrange(year, month)[1] - last_day_in_data, 0)
    prediksi_bulan_ini = int(
        daily_sum_bulan_ini.sum() + rata_per_hari * sisa_hari
    )
    persentase = float(total_sekarang / target * 100) if target > 0 and total_sekarang > 0 else 0

    # Trend harian 
    trend_harian = df.groupby(df["tanggal"].dt.date)["unit_entri"].sum().reset_index(name="jumlah").sort_values("tanggal")
    df["weekday"] = df["tanggal"].dt.weekday.map({0:"Senin",1:"Selasa",2:"Rabu",3:"Kamis",4:"Jumat",5:"Sabtu",6:"Minggu"})
    unit_per_hari = df.groupby("weekday")["unit_entri"].sum().reindex(["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]).reset_index(name="jumlah")
    distribusi_nama = df.groupby("nama")["unit_entri"].sum().reset_index(name="jumlah").sort_values("jumlah", ascending=False)

    # DISTRIBUSI TIPE PEKERJAAN SEKARANG vs LALU
    tipe_pekerjaan = [
        "kpb_1","kpb_2","kpb_3","kpb_4",
        "claim_c1___c2","p_lengkap","p_ringan","g_oli_plus"
    ]

    pakai_filter_global = bool(start_date or end_date or nama or hari)
    total_sekarang_pekerjaan = df_sekarang[tipe_pekerjaan].sum().to_frame().T
    total_sekarang_pekerjaan = clean_df_for_json(total_sekarang_pekerjaan, tipe_pekerjaan)

    if pakai_filter_global:
        total_lalu_pekerjaan = df_lalu[tipe_pekerjaan].sum().to_frame().T
    else:
        total_lalu_pekerjaan = pd.DataFrame([{k: None for k in tipe_pekerjaan}])

    total_lalu_pekerjaan = clean_df_for_json(total_lalu_pekerjaan, tipe_pekerjaan)

    # Susun dictionary akhir
    distribusi_pekerjaan_full = {}
    for pekerjaan in tipe_pekerjaan:
        sekarang = float(total_sekarang_pekerjaan[pekerjaan].iloc[0])
        lalu_raw = total_lalu_pekerjaan[pekerjaan].iloc[0]

        if not pakai_filter_global or pd.isna(lalu_raw):
            lalu = None
            status = {"status": "Stabil", "icon": "▬"}
        else:
            lalu = float(lalu_raw)
            delta = sekarang - lalu
            if delta > 0:
                status = {"status": "Naik", "icon": "▲"}
            elif delta < 0:
                status = {"status": "Turun", "icon": "▼"}
            else:
                status = {"status": "Stabil", "icon": "▬"}

        distribusi_pekerjaan_full[pekerjaan] = {
            "sekarang": sekarang,
            "lalu": lalu,
            "status": status
        }
        
    # DISTRIBUSI PER NAMA 
    distribusi_nama_sekarang = (
        df_sekarang
        .groupby("nama")["unit_entri"]
        .sum()
        .reset_index(name="jumlah")
    )

    distribusi_nama_lalu = (
        df_lalu
        .groupby("nama")["unit_entri"]
        .sum()
        .reset_index(name="jumlah")
    )

    distribusi_nama_sekarang = clean_df_for_json(distribusi_nama_sekarang, "jumlah")
    distribusi_nama_lalu = clean_df_for_json(distribusi_nama_lalu, "jumlah")

    # Bersihkan NaN / Inf
    trend_harian = clean_df_for_json(trend_harian, "jumlah")
    unit_per_hari = clean_df_for_json(unit_per_hari, "jumlah")
    distribusi_nama = clean_df_for_json(distribusi_nama, "jumlah")

    # Jasa & Sparepart (Convert TEXT ke numeric dulu)
    try:
        temp = df.copy()
        for col in ["total_jasa", "part_total", "total_sparepart"]:
            if col in temp.columns:
                # Pastikan string dulu
                temp[col] = temp[col].astype(str)
                # Hapus titik ribuan & ubah koma jadi titik (standar float)
                temp[col] = temp[col].str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
                # Convert ke float, gagal -> 0
                temp[col] = pd.to_numeric(temp[col], errors='coerce').fillna(0)

        # groupby nama mekanik (atau bisa gabung nanti di frontend)
        jasa_part = temp.groupby("nama")[["total_jasa", "part_total", "total_sparepart"]].sum().reset_index()
        jasa_part = clean_df_for_json(jasa_part, ["total_jasa", "part_total", "total_sparepart"])

    except Exception as e:
        print("Error menghitung jasa_part:", e)
        jasa_part = pd.DataFrame(columns=["nama","total_jasa","part_total","total_sparepart"])

    return {
        "total_sekarang": safe_number(total_sekarang),
        "total_lalu": safe_number(total_lalu),
        "selisih": safe_number(selisih),
        "status": status,
        "is_filter_tanggal": pakai_filter_tanggal,
        "rata_rata_unit_entri": safe_number(round(rata_unit, 0)),
        "target": target,
        "sisa_hari": safe_number(int(sisa_hari)),
        "prediksi_bulan_ini": safe_number(prediksi_bulan_ini),
        "persentase_pencapaian": safe_number(
            round((total_sekarang / target * 100), 2) if target > 0 else 0
        ),
        "trend_harian": trend_harian.to_dict("records"),
        "unit_per_hari": unit_per_hari.to_dict("records"),
        "distribusi_tipe_pekerjaan": distribusi_pekerjaan_full,  
        "distribusi_per_nama_sekarang": distribusi_nama_sekarang.to_dict("records"),
        "distribusi_per_nama_lalu": distribusi_nama_lalu.to_dict("records"),
        "jasa_part": jasa_part.to_dict("records"),
        "periode_sekarang": {
            "start": start_filter.strftime("%Y-%m-%d"),
            "end": end_filter.strftime("%Y-%m-%d")
        },
        "periode_lalu": {
            "start": start_lalu.strftime("%Y-%m-%d"),
            "end": end_lalu.strftime("%Y-%m-%d")
        }
    }

@app.get("/kpb1")
def kpb1_dashboard(
    start_date: str | None = None,
    end_date: str | None = None
):
    # =========================
    # LOAD DATA
    # =========================
    df_kpb = pd.read_sql("SELECT * FROM kpb_12_service", engine)
    # Ambil penjualan mulai 1 Nov 2025
    df_sales = pd.read_sql("SELECT * FROM penjualan WHERE tgl_invoice >= '2025-11-01'", engine)

    # =========================
    # PAKSA KONVERSI TANGGAL SERVICE
    # =========================
    df_kpb["tanggal_service"] = pd.to_datetime(
        df_kpb["tanggal_service"].astype(str).str.strip(),  
        errors="coerce"                                     
    )
    if df_kpb["tanggal_service"].isna().any():
        print("Baris dengan tanggal_service kosong:", df_kpb[df_kpb["tanggal_service"].isna()])

    # =========================
    # FILTER TANGGAL SERVICE 
    # =========================
    if start_date:
        df_kpb = df_kpb[df_kpb["tanggal_service"] >= start_date]
    if end_date:
        df_kpb = df_kpb[df_kpb["tanggal_service"] <= end_date]

    # =========================
    # STANDARISASI no_rangka
    # =========================
    def clean_no_rangka(s):
        return s.astype(str).str.strip().str.upper().str.replace(r"[^A-Z0-9]", "", regex=True)

    df_kpb["no_rangka"] = clean_no_rangka(df_kpb["no_rangka"])
    df_sales["nomor_rangka"] = clean_no_rangka(df_sales["nomor_rangka"])

    # Hapus baris kosong
    df_kpb = df_kpb[df_kpb["no_rangka"].notna()]
    df_sales = df_sales[df_sales["nomor_rangka"].notna()]

    # =========================
    # CLAIM CUSTOMER
    # =========================
    df_claim = df_kpb.merge(
        df_sales,
        left_on="no_rangka",
        right_on="nomor_rangka",
        how="inner",
        suffixes=("_kpb", "_sales")
    )

    # Pilih kolom yang ingin ditampilkan di tabel
    df_claim_display = df_claim[[
        "nama_customer_sales",   
        "wiraniaga",             
        "no_rangka",
        "tanggal_service"
    ]].copy()

    df_claim_display.rename(columns={
        "nama_customer_sales": "nama_customer"
    }, inplace=True)

    # =========================
    # NON CLAIM
    # =========================
    today = pd.Timestamp.now().normalize()

    df_non_claim = df_sales[~df_sales["nomor_rangka"].isin(df_kpb["no_rangka"])].copy()

    # Pastikan tgl_invoice datetime
    df_non_claim["tgl_invoice"] = pd.to_datetime(df_non_claim["tgl_invoice"], errors="coerce")

    # Hitung usia motor dalam HARI
    df_non_claim["usia_hari"] = (today - df_non_claim["tgl_invoice"]).dt.days

    # Hitung juga versi bulan (kalau masih dipakai)
    df_non_claim["selisih_bulan"] = df_non_claim["usia_hari"] / 30

    df_potential = df_non_claim[df_non_claim["selisih_bulan"] <= 2].copy()
    df_potential["status"] = "POTENTIAL"
    df_potential["no_rangka"] = df_potential["nomor_rangka"]

    df_lost = df_non_claim[df_non_claim["selisih_bulan"] > 2].copy()
    df_lost["status"] = "LOST"
    df_lost["no_rangka"] = df_lost["nomor_rangka"]

    # =========================
    # DATA PETA POTENTIAL
    # =========================
    if "kecamatan" in df_potential.columns:
        peta_potential = (
            df_potential.groupby("kecamatan")
            .size()
            .reset_index(name="jumlah")
            .sort_values("jumlah", ascending=False)
        )
    else:
        peta_potential = pd.DataFrame(columns=["kecamatan", "jumlah"])

    # =========================
    # SUMMARY COUNT
    # =========================
    summary = {
        "claim": len(df_claim_display),
        "potential": len(df_potential),
        "lost": len(df_lost)
    }

    # =========================
    # RETURN
    # =========================
    return {
        "summary": summary,
        "claim": df_claim_display.fillna("-").to_dict("records"),
        "potential": df_potential.fillna("-").to_dict("records"),
        "lost": df_lost.fillna("-").to_dict("records"),
        "peta_potential": peta_potential.to_dict("records")
    }

from fastapi.responses import StreamingResponse
import io

@app.get("/kpb1/download-potential")
def download_potential(
    start_date: str | None = None,
    end_date: str | None = None
):
    df_kpb = pd.read_sql("SELECT * FROM kpb_12_service", engine)
    df_sales = pd.read_sql("SELECT * FROM penjualan WHERE tgl_invoice >= '2025-11-01'", engine)

    df_kpb["tanggal_service"] = pd.to_datetime(df_kpb["tanggal_service"], errors="coerce")

    if start_date:
        df_kpb = df_kpb[df_kpb["tanggal_service"] >= start_date]
    if end_date:
        df_kpb = df_kpb[df_kpb["tanggal_service"] <= end_date]

    def clean_no_rangka(s):
        return s.astype(str).str.strip().str.upper().str.replace(r"[^A-Z0-9]", "", regex=True)

    df_kpb["no_rangka"] = clean_no_rangka(df_kpb["no_rangka"])
    df_sales["nomor_rangka"] = clean_no_rangka(df_sales["nomor_rangka"])

    df_non_claim = df_sales[~df_sales["nomor_rangka"].isin(df_kpb["no_rangka"])].copy()
    df_non_claim["tgl_invoice"] = pd.to_datetime(df_non_claim["tgl_invoice"], errors="coerce")

    today = pd.Timestamp.now().normalize()
    df_non_claim["usia_hari"] = (today - df_non_claim["tgl_invoice"]).dt.days
    df_non_claim["selisih_bulan"] = df_non_claim["usia_hari"] / 30

    df_potential = df_non_claim[df_non_claim["selisih_bulan"] <= 2].copy()
    df_potential["status"] = "POTENTIAL"
    df_potential["no_rangka"] = df_potential["nomor_rangka"]

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df_potential.to_excel(writer, index=False, sheet_name="Potential")

    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=potential_kpb1.xlsx"}
    )

