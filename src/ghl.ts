import qs from "qs";
import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { createDecipheriv, createHash } from 'node:crypto';

import { Model, TokenType, AppUserType, InstallationDetails } from "./model";

export class GHL {
  public model: Model;

  constructor() {
    this.model = new Model();
  }

  async authorizationHandler(code: string) {
    if (!code) {
      console.warn(
        "Please provide code when making call to authorization Handler"
      );
    }
    await this.generateAccessTokenRefreshTokenPair(code);
  }

  decryptSSOData(key: string) {
    try {
      const blockSize = 16;
      const keySize = 32;
      const ivSize = 16;
      const saltSize = 8;
      
      const rawEncryptedData = Buffer.from(key, 'base64');
      const salt = rawEncryptedData.subarray(saltSize, blockSize);
      const cipherText = rawEncryptedData.subarray(blockSize);
      
      let result = Buffer.alloc(0, 0);
      while (result.length < (keySize + ivSize)) {
        const hasher = createHash('md5');
        result = Buffer.concat([
          result,
          hasher.update(Buffer.concat([
            result.subarray(-ivSize),
            Buffer.from(process.env.GHL_APP_SSO_KEY as string, 'utf-8'),
            salt
          ])).digest()
        ]);
      }
      
      const decipher = createDecipheriv(
        'aes-256-cbc',
        result.subarray(0, keySize),
        result.subarray(keySize, keySize + ivSize)
      );
      
      const decrypted = decipher.update(cipherText);
      const finalDecrypted = Buffer.concat([decrypted, decipher.final()]);
      return JSON.parse(finalDecrypted.toString());
    } catch (error) {
      console.error('Error decrypting SSO data:', error);
      throw error;
    }
  }

  requests(resourceId: string) {
    const baseUrl = process.env.GHL_API_DOMAIN;
    const model = this.model;

    const axiosInstance = axios.create({
        baseURL: baseUrl,
    });

    axiosInstance.interceptors.request.use(
        async (requestConfig: InternalAxiosRequestConfig) => {
            try {
                requestConfig.headers["Authorization"] = `${TokenType.Bearer} ${await model.getAccessToken(resourceId)}`;
                requestConfig.headers["locationId"] = resourceId;
            } catch (e) {
                console.error(e);
            }
            return requestConfig;
        }
    );

    axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;
            if (error.response.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;
                await this.refreshAccessToken(resourceId);
                originalRequest.headers.Authorization = `Bearer ${await model.getAccessToken(resourceId)}`;
                return axios(originalRequest);
            }
            return Promise.reject(error);
        }
    );
    return axiosInstance;
  }

  async checkInstallationExists(resourceId: string): Promise<boolean>{
    return await this.model.checkInstallationExists(resourceId)
  }

  async deleteInstallationInfo(locationId: string) {
    await this.model.deleteInstallationInfo(locationId);
  }

  async getLocationTokenFromCompanyToken(
    companyId: string,
    locationId: string
  ) {
    const res = await this.requests(companyId).post(
      "/oauth/locationToken",
      {
        companyId,
        locationId,
      },
      {
        headers: {
          Version: "2021-07-28",
        },
      }
    );
    this.model.saveInstallationInfo(res.data);
  }

  private async refreshAccessToken(resourceId: string) {
    try {
      const resp = await axios.post(
        `${process.env.GHL_API_DOMAIN}/oauth/token`,
        qs.stringify({
          client_id: process.env.GHL_APP_CLIENT_ID,
          client_secret: process.env.GHL_APP_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: await this.model.getRefreshToken(resourceId),
        }),
        { headers: { "content-type": "application/x-www-form-urlencoded" } }
      );
      await this.model.saveInstallationInfo({
        ...resp.data,
        locationId: resourceId,
      });
    } catch (error: any) {
      console.error(error?.response?.data);
    }
  }

  private async generateAccessTokenRefreshTokenPair(code: string) {
    try {
      const resp = await axios.post(
        `${process.env.GHL_API_DOMAIN}/oauth/token`,
        qs.stringify({
          client_id: process.env.GHL_APP_CLIENT_ID,
          client_secret: process.env.GHL_APP_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
        }),
        { headers: { "content-type": "application/x-www-form-urlencoded" } }
      );
      await this.model.saveInstallationInfo({
        ...resp.data,
        locationId: resp.data.locationId,
        companyId: resp.data.companyId
      });
    } catch (error: any) {
      console.error(error?.response?.data);
    }
  }
}