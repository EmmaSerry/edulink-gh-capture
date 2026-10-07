/**
 * Extra district administrators - Super Admin only. The account itself is
 * created by the create-district-admin Edge Function (it needs the secret
 * key and the SMS key); listing / removing go through database functions
 * that check the caller is the Super Admin.
 */
import { rest, edgeFunctions } from "@/lib/supabaseClient";

export interface DistrictAdminRow {
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  district_id: string;
  district_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AssignableDistrict {
  id: string;
  name: string;
  region: string | null;
}

export interface CreateDistrictAdminResult {
  created: boolean;
  notified: boolean;
  warning?: string;
  email?: string;
  tempPassword?: string;
}

export interface ResendResult {
  resent: boolean;
  notified: boolean;
  phone?: string;
  warning?: string;
  email?: string;
  tempPassword?: string;
}

class DistrictAdminServiceImpl {
  list(): Promise<DistrictAdminRow[]> {
    return rest.rpc<DistrictAdminRow[]>("list_district_admins", {});
  }

  districts(): Promise<AssignableDistrict[]> {
    return rest.rpc<AssignableDistrict[]>("list_assignable_districts", {});
  }

  create(values: { districtId: string; fullName: string; phone: string; email: string }) {
    return edgeFunctions.invoke<CreateDistrictAdminResult>("create-district-admin", { action: "create", ...values });
  }

  /** Issues a NEW password (the old one cannot be read back) and texts the
   *  sign-in details again - optionally to a corrected phone number. */
  resend(userId: string, phone?: string) {
    return edgeFunctions.invoke<ResendResult>("create-district-admin", { action: "resend", userId, phone });
  }

  async setActive(userId: string, active: boolean): Promise<void> {
    await rest.rpc<void>("set_district_admin_active", { p_user_id: userId, p_active: active });
  }
}

export const DistrictAdminService = new DistrictAdminServiceImpl();
