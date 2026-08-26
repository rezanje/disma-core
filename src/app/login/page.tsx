import Image from "next/image"
import LoginForm from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Left Side - Form (Takes full width on mobile, half on desktop) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 md:p-12 lg:p-24 relative z-10 bg-card">
        
        {/* Mobile Illustration (hidden on desktop, visible on mobile) */}
        <div className="lg:hidden mb-8 w-full flex justify-center mt-4">
            <div className="relative w-full max-w-[280px]">
              <Image 
                src="/1.png" 
                alt="DISMA Fresh" 
                width={500} 
                height={500} 
                className="w-full h-auto object-contain mix-blend-multiply" 
                priority
              />
            </div>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-sm xl:max-w-md space-y-8">
          <div className="text-left space-y-2 mb-10">
            <h1 className="text-[26px] leading-tight font-semibold text-slate-900">
              Masuk ke Disma Fresh
            </h1>
            <p className="pt-2 text-[13px] text-slate-500">
              Masukkan PIN lo. Lupa PIN? Minta admin sistem yang reset — bukan lewat WhatsApp grup.
            </p>
          </div>
          
          <LoginForm />
        </div>
      </div>

      {/* Right Side - Illustration (Hidden on mobile, visible on desktop) */}
      <div className="hidden lg:flex w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden bg-white">
        
        {/* 3D Illustration */}
        <div className="relative z-10 w-full max-w-2xl duration-150 transform transition-transform ease-out">
          {/* Note: Removed drop-shadows on the image because they render around the square bounds of the PNG, destroying the mix-blend-multiply effect. */}
          <Image 
            src="/1.png" 
            alt="Delivery Illustration" 
            width={1000} 
            height={1000} 
            className="w-full h-auto object-contain mix-blend-multiply"
            style={{ mixBlendMode: 'multiply' }}
            priority
          />
        </div>
      </div>
    </div>
  )
}
