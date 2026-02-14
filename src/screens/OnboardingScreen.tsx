import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export default function OnboardingScreen() {
  const { updateUserProfile, fetchUserProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [heightUnit, setHeightUnit] = useState<'imperial' | 'metric'>('imperial');
  const [weightUnit, setWeightUnit] = useState<'imperial' | 'metric'>('imperial');
  
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [weightKg, setWeightKg] = useState('');

  const convertToCm = (): number => {
    if (heightUnit === 'metric') {
      return parseFloat(heightCm) || 0;
    }
    const ft = parseFloat(feet) || 0;
    const inc = parseFloat(inches) || 0;
    return Math.round((ft * 30.48) + (inc * 2.54));
  };

  const convertToKg = (): number => {
    if (weightUnit === 'metric') {
      return parseFloat(weightKg) || 0;
    }
    const lbs = parseFloat(weightLbs) || 0;
    return Math.round(lbs * 0.453592 * 10) / 10;
  };

  const handleSubmit = async () => {
    const heightCmValue = convertToCm();
    const weightKgValue = convertToKg();

    if (heightCmValue <= 0 || weightKgValue <= 0) {
      Alert.alert('Error', 'Please enter valid height and weight');
      return;
    }

    try {
      setLoading(true);
      await updateUserProfile({
        height_cm: heightCmValue,
        weight_kg: weightKgValue,
        onboarding_completed: true,
      });
      await fetchUserProfile();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Let's get to know you</Text>
          <Text style={styles.subtitle}>This helps us personalize your experience</Text>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Height</Text>
              <TouchableOpacity
                style={styles.unitToggle}
                onPress={() => setHeightUnit(heightUnit === 'imperial' ? 'metric' : 'imperial')}
              >
                <Text style={styles.unitText}>
                  {heightUnit === 'imperial' ? 'ft/in' : 'cm'} ▼
                </Text>
              </TouchableOpacity>
            </View>

            {heightUnit === 'imperial' ? (
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <TextInput
                    style={styles.input}
                    placeholder="Feet"
                    placeholderTextColor="#999"
                    value={feet}
                    onChangeText={setFeet}
                    keyboardType="numeric"
                    editable={!loading}
                  />
                </View>
                <View style={styles.halfInput}>
                  <TextInput
                    style={styles.input}
                    placeholder="Inches"
                    placeholderTextColor="#999"
                    value={inches}
                    onChangeText={setInches}
                    keyboardType="numeric"
                    editable={!loading}
                  />
                </View>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Height in cm"
                placeholderTextColor="#999"
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="numeric"
                editable={!loading}
              />
            )}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Weight</Text>
              <TouchableOpacity
                style={styles.unitToggle}
                onPress={() => setWeightUnit(weightUnit === 'imperial' ? 'metric' : 'imperial')}
              >
                <Text style={styles.unitText}>
                  {weightUnit === 'imperial' ? 'lbs' : 'kg'} ▼
                </Text>
              </TouchableOpacity>
            </View>

            {weightUnit === 'imperial' ? (
              <TextInput
                style={styles.input}
                placeholder="Weight in lbs"
                placeholderTextColor="#999"
                value={weightLbs}
                onChangeText={setWeightLbs}
                keyboardType="numeric"
                editable={!loading}
              />
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Weight in kg"
                placeholderTextColor="#999"
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="numeric"
                editable={!loading}
              />
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: 24,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  unitToggle: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
