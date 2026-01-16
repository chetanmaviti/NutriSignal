import os
import jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from dotenv import load_dotenv

load_dotenv()

# Supabase JWT verification
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Note: SUPABASE_JWT_SECRET is your Supabase JWT Secret, NOT the anon key
# You can find it in your Supabase project settings under API > JWT Settings

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthCredentials = Depends(security)):
    """
    Verify Supabase JWT token
    
    This function extracts and validates the JWT token from the Authorization header.
    The token should be passed as: Authorization: Bearer <token>
    """
    token = credentials.credentials
    
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="JWT secret not configured. Set SUPABASE_JWT_SECRET environment variable."
        )
    
    try:
        # Verify and decode the JWT token
        # Note: Supabase uses HS256 by default
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
        
        return {"user_id": user_id, "email": payload.get("email")}
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_user_from_token(credentials: HTTPAuthCredentials = Depends(security)) -> dict:
    """
    Extract user information from Supabase JWT token
    """
    return await verify_token(credentials)
